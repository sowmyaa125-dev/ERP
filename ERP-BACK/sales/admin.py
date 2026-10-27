from django.contrib import admin

from common.admin_mixins import ReadOnlyAdminMixin

from .models import Quotation, QuotationItem, SalesInvoice, SalesInvoiceItem, SalesOrder, SalesOrderItem


class QuotationItemInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = QuotationItem
    extra = 0


class SalesOrderItemInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = SalesOrderItem
    extra = 0


class SalesInvoiceItemInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = SalesInvoiceItem
    extra = 0


@admin.register(Quotation)
class QuotationAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['number', 'date', 'customer', 'grand_total', 'status', 'company']
    list_filter = ['status', 'company']
    search_fields = ['number', 'customer__name']
    inlines = [QuotationItemInline]


@admin.register(SalesOrder)
class SalesOrderAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['number', 'date', 'customer', 'grand_total', 'status', 'company']
    list_filter = ['status', 'company']
    search_fields = ['number', 'customer__name']
    inlines = [SalesOrderItemInline]


@admin.register(SalesInvoice)
class SalesInvoiceAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['number', 'date', 'customer', 'grand_total', 'amount_paid', 'status', 'company']
    list_filter = ['status', 'company']
    search_fields = ['number', 'customer__name']
    inlines = [SalesInvoiceItemInline]
