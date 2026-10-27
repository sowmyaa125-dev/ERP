from django.db import models


class Customer(models.Model):

    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
    )

    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='customers')
    branch = models.ForeignKey(
        'companies.Branch', on_delete=models.SET_NULL, related_name='customers', blank=True, null=True
    )

    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    pin_code = models.CharField(max_length=10, blank=True, null=True)
    gst_number = models.CharField(max_length=30, blank=True, null=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')

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
            models.UniqueConstraint(fields=['company', 'code'], name='unique_customer_code_per_company')
        ]

    def __str__(self):
        return self.name