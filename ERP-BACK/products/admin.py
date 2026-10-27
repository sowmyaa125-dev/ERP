from django.contrib import admin

from .models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'company', 'selling_price', 'status']
    list_filter = ['status', 'company', 'product_type']
    search_fields = ['name', 'code', 'barcode']