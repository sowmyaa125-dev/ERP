from django.db import models

from common.documents import PayableDocumentMixin, TaxDocument, TaxLine


class Quotation(TaxDocument):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('SENT', 'Sent'),
        ('ACCEPTED', 'Accepted'),
        ('REJECTED', 'Rejected'),
        ('CONVERTED', 'Converted to Order'),
    )

    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='quotations')
    valid_until = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')

    class Meta(TaxDocument.Meta):
        pass


class QuotationItem(TaxLine):
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name='items')


class SalesOrder(TaxDocument):
    """A confirmed customer order. Invoices are raised against it; it never touches stock itself."""

    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('CONFIRMED', 'Confirmed'),
        ('PARTIALLY_INVOICED', 'Partially Invoiced'),
        ('INVOICED', 'Invoiced'),
        ('CANCELLED', 'Cancelled'),
    )

    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='sales_orders')
    quotation = models.ForeignKey(Quotation, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    warehouse = models.ForeignKey(
        'masters.Warehouse', on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
        help_text='Default dispatch warehouse.',
    )
    expected_delivery_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')

    class Meta(TaxDocument.Meta):
        pass

    def refresh_invoice_status(self):
        if self.status in ('DRAFT', 'CANCELLED'):
            return
        items = list(self.items.all())
        any_done = any(i.invoiced_quantity > 0 for i in items)
        all_done = all(i.invoiced_quantity >= i.quantity for i in items)
        self.status = 'INVOICED' if all_done else 'PARTIALLY_INVOICED' if any_done else 'CONFIRMED'
        self.save(update_fields=['status', 'updated_at'])


class SalesOrderItem(TaxLine):
    order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name='items')
    invoiced_quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    @property
    def pending_quantity(self):
        return max(self.quantity - self.invoiced_quantity, 0)


class SalesInvoice(PayableDocumentMixin, TaxDocument):
    """GST tax invoice. Creating it takes the goods out of `warehouse` (SALE_OUT)."""

    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, related_name='invoices')
    sales_order = models.ForeignKey(SalesOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices')
    warehouse = models.ForeignKey('masters.Warehouse', on_delete=models.PROTECT, related_name='+')

    class Meta(TaxDocument.Meta):
        pass


class SalesInvoiceItem(TaxLine):
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.CASCADE, related_name='items')
    order_item = models.ForeignKey(
        SalesOrderItem, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoice_items'
    )
