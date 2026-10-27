from django.db import models
from django.utils import timezone

from common.documents import PayableDocumentMixin, TaxDocument, TaxLine


class PurchaseOrder(TaxDocument):
    """What we intend to buy. Drives goods receipts; never touches stock itself."""

    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('APPROVED', 'Approved'),
        ('PARTIALLY_RECEIVED', 'Partially Received'),
        ('RECEIVED', 'Received'),
        ('CANCELLED', 'Cancelled'),
    )

    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.PROTECT, related_name='purchase_orders')
    warehouse = models.ForeignKey(
        'masters.Warehouse', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='Default receiving warehouse.',
    )
    expected_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')

    class Meta(TaxDocument.Meta):
        pass

    def refresh_receipt_status(self):
        if self.status in ('DRAFT', 'CANCELLED'):
            return
        items = list(self.items.all())
        received_any = any(i.received_quantity > 0 for i in items)
        received_all = all(i.received_quantity >= i.quantity for i in items)
        self.status = 'RECEIVED' if received_all else 'PARTIALLY_RECEIVED' if received_any else 'APPROVED'
        self.save(update_fields=['status', 'updated_at'])


class PurchaseOrderItem(TaxLine):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    received_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    @property
    def pending_quantity(self):
        return max(self.quantity - self.received_quantity, 0)


class GoodsReceipt(models.Model):
    """Goods physically received into a warehouse. Each line posts PURCHASE_IN stock."""

    STATUS_CHOICES = (
        ('RECEIVED', 'Received'),
        ('CANCELLED', 'Cancelled'),
    )

    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='goods_receipts')
    branch = models.ForeignKey('companies.Branch', on_delete=models.SET_NULL, related_name='+', blank=True, null=True)
    number = models.CharField(max_length=30)
    date = models.DateField(default=timezone.localdate)
    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.PROTECT, related_name='goods_receipts')
    warehouse = models.ForeignKey('masters.Warehouse', on_delete=models.PROTECT, related_name='+')
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.PROTECT, null=True, blank=True, related_name='receipts'
    )
    supplier_reference = models.CharField(max_length=100, blank=True, null=True, help_text='Delivery challan / LR number')
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='RECEIVED')

    created_by = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-id']
        constraints = [
            models.UniqueConstraint(fields=['company', 'number'], name='unique_goods_receipt_number')
        ]

    def __str__(self):
        return self.number


class GoodsReceiptItem(models.Model):
    receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', on_delete=models.PROTECT, related_name='+')
    order_item = models.ForeignKey(
        PurchaseOrderItem, on_delete=models.PROTECT, null=True, blank=True, related_name='receipt_items'
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        ordering = ['id']


class PurchaseBill(PayableDocumentMixin, TaxDocument):
    """
    The supplier's invoice — what we owe. If it is not linked to a goods
    receipt, `update_stock` lets a direct purchase add stock in one step.
    """

    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.PROTECT, related_name='purchase_bills')
    supplier_invoice_number = models.CharField(max_length=50)
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='bills'
    )
    goods_receipt = models.ForeignKey(
        GoodsReceipt, on_delete=models.PROTECT, null=True, blank=True, related_name='bills'
    )
    update_stock = models.BooleanField(default=False)
    warehouse = models.ForeignKey('masters.Warehouse', on_delete=models.PROTECT, null=True, blank=True, related_name='+')

    class Meta(TaxDocument.Meta):
        pass


class PurchaseBillItem(TaxLine):
    bill = models.ForeignKey(PurchaseBill, on_delete=models.CASCADE, related_name='items')
