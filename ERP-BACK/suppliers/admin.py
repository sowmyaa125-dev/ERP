from django.contrib import admin

from .models import Supplier


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'company', 'branch', 'status']
    list_filter = ['status', 'company']
    search_fields = ['name', 'code', 'email']