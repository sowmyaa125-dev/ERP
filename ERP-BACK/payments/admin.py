from django.contrib import admin

from common.admin_mixins import ReadOnlyAdminMixin

from .models import Payment, PaymentAllocation


class PaymentAllocationInline(ReadOnlyAdminMixin, admin.TabularInline):
    model = PaymentAllocation
    extra = 0


@admin.register(Payment)
class PaymentAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ['number', 'date', 'payment_type', 'customer', 'supplier', 'amount', 'mode', 'status']
    list_filter = ['payment_type', 'mode', 'status', 'company']
    search_fields = ['number', 'reference', 'customer__name', 'supplier__name']
    inlines = [PaymentAllocationInline]
