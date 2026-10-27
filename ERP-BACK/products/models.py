from django.db import models


class Product(models.Model):

    PRODUCT_TYPE_CHOICES = (
        ('GOODS', 'Goods'),
        ('SERVICE', 'Service'),
    )

    TAX_TYPE_CHOICES = (
        ('INCLUSIVE', 'Tax Inclusive'),
        ('EXCLUSIVE', 'Tax Exclusive'),
    )

    GST_TYPE_CHOICES = (
        ('TAXABLE', 'Taxable'),
        ('EXEMPT', 'Exempt'),
        ('ZERO_RATED', 'Zero Rated'),
    )

    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='products')

    code = models.CharField(max_length=50, help_text='Product Code / SKU')
    name = models.CharField(max_length=200)
    product_type = models.CharField(max_length=10, choices=PRODUCT_TYPE_CHOICES, default='GOODS')
    description = models.TextField(blank=True, null=True)

    brand = models.ForeignKey('masters.Brand', on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    group = models.ForeignKey('masters.Group', on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    sub_group = models.ForeignKey('masters.SubGroup', on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    category = models.ForeignKey('masters.Category', on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    sub_category = models.ForeignKey('masters.SubCategory', on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    unit = models.ForeignKey('masters.UnitMaster', on_delete=models.SET_NULL, null=True, blank=True, related_name='products')

    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    mrp = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    tax_type = models.CharField(max_length=10, choices=TAX_TYPE_CHOICES, default='EXCLUSIVE')
    gst_master = models.ForeignKey('masters.GSTMaster', on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    gst_type = models.CharField(max_length=15, choices=GST_TYPE_CHOICES, default='TAXABLE')
    hsn_code = models.CharField(max_length=20, blank=True, null=True)

    opening_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    opening_stock_date = models.DateField(blank=True, null=True)
    minimum_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    minimum_order_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    barcode = models.CharField(max_length=100, blank=True, null=True)
    discount_allowed = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='Percentage')
    warranty_period = models.CharField(max_length=50, blank=True, null=True, help_text="e.g. '12 months'")
    image = models.ImageField(upload_to='products/', blank=True, null=True)

    status = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)

    created_by = models.ForeignKey(
        'accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        'accounts.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['company', 'code'], name='unique_product_code_per_company')
        ]

    def __str__(self):
        return f'{self.name} ({self.code})'