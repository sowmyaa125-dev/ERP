from django.contrib import admin

from common.admin_mixins import ReadOnlyAdminMixin

from .models import Stock, StockMovement


@admin.register(Stock)
class StockAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['product', 'warehouse', 'quantity', 'company']
    list_filter = ['company']
    search_fields = ['product__name', 'warehouse__name']


@admin.register(StockMovement)
class StockMovementAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['product', 'warehouse', 'movement_type', 'quantity', 'created_at']
    list_filter = ['movement_type', 'company']
    search_fields = ['product__name', 'warehouse__name']