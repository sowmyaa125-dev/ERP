"""
Shared building blocks for GST documents (purchase orders, bills,
quotations, sales orders, invoices). Each concrete app subclasses these
abstract models so the tax maths lives in exactly one place.
"""
from decimal import ROUND_HALF_UP, Decimal

from django.db import models
from django.utils import timezone

TWO_PLACES = Decimal('0.01')
ZERO = Decimal('0')


def money(value):
    return Decimal(value or 0).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


class TaxDocument(models.Model):
    """Header fields + totals shared by every GST document."""

    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='+')
    branch = models.ForeignKey('companies.Branch', on_delete=models.SET_NULL, related_name='+', blank=True, null=True)

    number = models.CharField(max_length=30)
    date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True, null=True)

    # True when the party is in a different state than the seller/buyer
    # (IGST); False means the tax is split into CGST + SGST.
    is_inter_state = models.BooleanField(default=False)
    place_of_supply = models.CharField(max_length=100, blank=True, null=True)

    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    sgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    round_off = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    created_by = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey('accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ['-date', '-id']
        constraints = [
            models.UniqueConstraint(fields=['company', 'number'], name='%(app_label)s_%(class)s_unique_number')
        ]

    def __str__(self):
        return self.number

    @property
    def tax_amount(self):
        return self.cgst_amount + self.sgst_amount + self.igst_amount

    def recalculate_totals(self):
        """Sum the saved lines into the header and round the total to the rupee."""
        lines = list(self.items.all())
        self.taxable_amount = sum((l.taxable_amount for l in lines), ZERO)
        self.cgst_amount = sum((l.cgst_amount for l in lines), ZERO)
        self.sgst_amount = sum((l.sgst_amount for l in lines), ZERO)
        self.igst_amount = sum((l.igst_amount for l in lines), ZERO)
        exact = self.taxable_amount + self.tax_amount
        rounded = exact.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        self.round_off = rounded - exact
        self.grand_total = rounded
        self.save(update_fields=[
            'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount',
            'round_off', 'grand_total', 'updated_at',
        ])


class PayableDocumentMixin(models.Model):
    """Bills and invoices: track how much has been settled by payments."""

    PAYMENT_STATUS_CHOICES = (
        ('UNPAID', 'Unpaid'),
        ('PARTIALLY_PAID', 'Partially Paid'),
        ('PAID', 'Paid'),
        ('CANCELLED', 'Cancelled'),
    )

    due_date = models.DateField(blank=True, null=True)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='UNPAID')

    class Meta:
        abstract = True

    @property
    def balance_due(self):
        if self.status == 'CANCELLED':
            return ZERO
        return self.grand_total - self.amount_paid

    def refresh_payment_status(self, allocation_field):
        """Recompute amount_paid from active payment allocations."""
        from payments.models import PaymentAllocation

        paid = PaymentAllocation.objects.filter(
            **{allocation_field: self}, payment__status='ACTIVE'
        ).aggregate(total=models.Sum('amount'))['total'] or ZERO
        self.amount_paid = paid
        if self.status != 'CANCELLED':
            if paid <= 0:
                self.status = 'UNPAID'
            elif paid < self.grand_total:
                self.status = 'PARTIALLY_PAID'
            else:
                self.status = 'PAID'
        self.save(update_fields=['amount_paid', 'status', 'updated_at'])


class TaxLine(models.Model):
    """One product line with discount and GST, computed on save."""

    product = models.ForeignKey('products.Product', on_delete=models.PROTECT, related_name='+')
    description = models.CharField(max_length=255, blank=True, null=True)
    hsn_code = models.CharField(max_length=20, blank=True, null=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=2)
    rate = models.DecimalField(max_digits=12, decimal_places=2, help_text='Price per unit, excluding GST')
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    gst_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    sgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        abstract = True
        ordering = ['id']

    def compute(self, inter_state):
        gross = Decimal(self.quantity) * Decimal(self.rate)
        taxable = money(gross * (1 - Decimal(self.discount_percent) / 100))
        tax = money(taxable * Decimal(self.gst_percent) / 100)
        if inter_state:
            self.igst_amount, self.cgst_amount, self.sgst_amount = tax, ZERO, ZERO
        else:
            half = money(tax / 2)
            self.igst_amount, self.cgst_amount, self.sgst_amount = ZERO, half, tax - half
        self.taxable_amount = taxable
        self.total_amount = taxable + tax
