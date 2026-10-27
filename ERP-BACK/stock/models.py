from django.core.exceptions import ValidationError
from django.db import models


class Stock(models.Model):
    """
    Current balance, denormalized for fast lookups. Never edited directly —
    only StockMovement.save() updates this, so the ledger and the balance
    can never drift apart.
    """
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='stock_balances')
    product = models.ForeignKey('products.Product', on_delete=models.CASCADE, related_name='stock_balances')
    warehouse = models.ForeignKey('masters.Warehouse', on_delete=models.CASCADE, related_name='stock_balances')
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['product', 'warehouse'], name='unique_stock_per_product_warehouse')
        ]

    def __str__(self):
        return f'{self.product.name} @ {self.warehouse.name}: {self.quantity}'


class StockMovement(models.Model):
    """
    Append-only ledger. Every stock-affecting event — opening stock,
    goods receipt, delivery, adjustment, transfer — writes one row here
    (transfers write two: OUT from source, IN to destination).
    """

    MOVEMENT_TYPE_CHOICES = (
        ('OPENING', 'Opening Stock'),
        ('PURCHASE_IN', 'Purchase / Goods Receipt'),
        ('SALE_OUT', 'Sales Delivery'),
        ('ADJUSTMENT', 'Stock Adjustment'),
        ('TRANSFER_IN', 'Stock Transfer In'),
        ('TRANSFER_OUT', 'Stock Transfer Out'),
    )

    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='stock_movements')
    product = models.ForeignKey('products.Product', on_delete=models.CASCADE, related_name='stock_movements')
    warehouse = models.ForeignKey('masters.Warehouse', on_delete=models.CASCADE, related_name='stock_movements')

    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPE_CHOICES)
    # Signed quantity: positive for IN movements, negative for OUT movements.
    quantity = models.DecimalField(max_digits=14, decimal_places=2)

    reference_note = models.CharField(max_length=255, blank=True, null=True)
    # Links a transfer's two rows (OUT + IN) together; null for everything else.
    transfer_group = models.CharField(max_length=40, blank=True, null=True)

    created_by = models.ForeignKey(
        'accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.movement_type} {self.quantity} — {self.product.name} @ {self.warehouse.name}'

    def clean(self):
        if self.product.company_id != self.company_id:
            raise ValidationError('Product must belong to the same company as the movement.')
        if self.warehouse.company_id != self.company_id:
            raise ValidationError('Warehouse must belong to the same company as the movement.')

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:
            stock, _ = Stock.objects.get_or_create(
                company=self.company, product=self.product, warehouse=self.warehouse,
                defaults={'quantity': 0},
            )
            stock.quantity = stock.quantity + self.quantity
            stock.save(update_fields=['quantity', 'updated_at'])