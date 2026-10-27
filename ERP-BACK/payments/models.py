from django.db import models
from django.utils import timezone


class Payment(models.Model):
    """
    Money in from a customer (RECEIPT) or out to a supplier (PAYMENT).
    The amount can be split across invoices/bills via allocations; any
    unallocated part stays on the party's account as an advance.
    """

    TYPE_CHOICES = (
        ('RECEIPT', 'Receipt from Customer'),
        ('PAYMENT', 'Payment to Supplier'),
    )
    MODE_CHOICES = (
        ('CASH', 'Cash'),
        ('BANK', 'Bank Transfer'),
        ('UPI', 'UPI'),
        ('CHEQUE', 'Cheque'),
        ('CARD', 'Card'),
    )
    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('CANCELLED', 'Cancelled'),
    )

    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='payments')
    branch = models.ForeignKey('companies.Branch', on_delete=models.SET_NULL, related_name='+', blank=True, null=True)
    number = models.CharField(max_length=30)
    date = models.DateField(default=timezone.localdate)
    payment_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    customer = models.ForeignKey('customers.Customer', on_delete=models.PROTECT, null=True, blank=True, related_name='payments')
    supplier = models.ForeignKey('suppliers.Supplier', on_delete=models.PROTECT, null=True, blank=True, related_name='payments')
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default='CASH')
    reference = models.CharField(max_length=100, blank=True, null=True, help_text='UTR / cheque number')
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='ACTIVE')

    created_by = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-id']
        constraints = [
            models.UniqueConstraint(fields=['company', 'number'], name='unique_payment_number')
        ]

    def __str__(self):
        return self.number

    @property
    def allocated_amount(self):
        return sum((a.amount for a in self.allocations.all()), 0)

    @property
    def unallocated_amount(self):
        return self.amount - self.allocated_amount


class PaymentAllocation(models.Model):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='allocations')
    sales_invoice = models.ForeignKey(
        'sales.SalesInvoice', on_delete=models.PROTECT, null=True, blank=True, related_name='allocations'
    )
    purchase_bill = models.ForeignKey(
        'purchases.PurchaseBill', on_delete=models.PROTECT, null=True, blank=True, related_name='allocations'
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        ordering = ['id']

    @property
    def document(self):
        return self.sales_invoice or self.purchase_bill
