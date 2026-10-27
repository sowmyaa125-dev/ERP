from django.contrib import admin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'company', 'branch', 'status']
    list_filter = ['status', 'company']
    search_fields = ['name', 'code', 'email']