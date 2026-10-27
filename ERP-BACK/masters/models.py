from django.db import models


class Group(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='groups')
    name = models.CharField(max_length=150)
    status = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['company', 'name'], name='unique_group_per_company')
        ]

    def __str__(self):
        return self.name


class SubGroup(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='sub_groups')
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='sub_groups')
    name = models.CharField(max_length=150)
    status = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['group', 'name'], name='unique_subgroup_per_group')
        ]

    def __str__(self):
        return self.name


class Category(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=150)
    status = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['company', 'name'], name='unique_category_per_company')
        ]

    def __str__(self):
        return self.name


class SubCategory(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='sub_categories')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='sub_categories')
    name = models.CharField(max_length=150)
    status = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['category', 'name'], name='unique_subcategory_per_category')
        ]

    def __str__(self):
        return self.name


class Brand(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='brands')
    name = models.CharField(max_length=150)
    status = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['company', 'name'], name='unique_brand_per_company')
        ]

    def __str__(self):
        return self.name


class GSTMaster(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='gst_masters')
    name = models.CharField(max_length=50, help_text="e.g. 'GST 18%'")
    percentage = models.DecimalField(max_digits=5, decimal_places=2)
    status = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'GST Master'
        constraints = [
            models.UniqueConstraint(fields=['company', 'name'], name='unique_gst_master_per_company')
        ]

    def __str__(self):
        return f'{self.name} ({self.percentage}%)'


class UnitMaster(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='unit_masters')
    name = models.CharField(max_length=50, help_text="e.g. 'Kilogram', 'Piece'")
    short_name = models.CharField(max_length=10, help_text="e.g. 'kg', 'pc'")
    status = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Unit Master'
        constraints = [
            models.UniqueConstraint(fields=['company', 'name'], name='unique_unit_master_per_company')
        ]

    def __str__(self):
        return self.short_name


class Warehouse(models.Model):
    company = models.ForeignKey('companies.Company', on_delete=models.CASCADE, related_name='warehouses')
    branch = models.ForeignKey(
        'companies.Branch', on_delete=models.SET_NULL, related_name='warehouses', blank=True, null=True,
        help_text='Normally set, to enable branch-wise stock tracking.',
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True)
    status = models.BooleanField(default=True)

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
            models.UniqueConstraint(fields=['company', 'code'], name='unique_warehouse_code_per_company')
        ]

    def __str__(self):
        return self.name