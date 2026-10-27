from django.contrib import admin

from common.admin_mixins import ReadOnlyAdminMixin

from .models import GoodsReceipt, GoodsReceiptItem, PurchaseBill, PurchaseBillItem, PurchaseOrder, PurchaseOrderItem


class PurchaseOrderItemInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0


class GoodsReceiptItemInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = GoodsReceiptItem
    extra = 0


class PurchaseBillItemInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = PurchaseBillItem
    extra = 0


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['number', 'date', 'supplier', 'grand_total', 'status', 'company']
    list_filter = ['status', 'company']
    search_fields = ['number', 'supplier__name']
    inlines = [PurchaseOrderItemInline]


@admin.register(GoodsReceipt)
class GoodsReceiptAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['number', 'date', 'supplier', 'warehouse', 'purchase_order', 'status']
    list_filter = ['status', 'company']
    search_fields = ['number', 'supplier__name']
    inlines = [GoodsReceiptItemInline]


@admin.register(PurchaseBill)
class PurchaseBillAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['number', 'supplier_invoice_number', 'date', 'supplier', 'grand_total', 'amount_paid', 'status']
    list_filter = ['status', 'company']
    search_fields = ['number', 'supplier_invoice_number', 'supplier__name']
    inlines = [PurchaseBillItemInline]
