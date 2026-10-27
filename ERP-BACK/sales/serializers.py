from rest_framework import serializers

from common.serializers import (
    DOCUMENT_FIELDS, DOCUMENT_READ_ONLY, LINE_FIELDS, LINE_READ_ONLY,
    TaxDocumentSerializer, TaxLineSerializer,
)
from common.services import post_stock

from .models import (
    Quotation, QuotationItem, SalesInvoice, SalesInvoiceItem,
    SalesOrder, SalesOrderItem,
)


class _CustomerDocumentSerializer(TaxDocumentSerializer):
    party_field = 'customer'
    customer_name = serializers.CharField(source='customer.name', read_only=True)


# ---------- Quotations ----------

class QuotationItemSerializer(TaxLineSerializer):
    class Meta:
        model = QuotationItem
        fields = LINE_FIELDS
        read_only_fields = LINE_READ_ONLY


class QuotationSerializer(_CustomerDocumentSerializer):
    number_prefix = 'QT-'
    line_parent_field = 'quotation'
    editable_statuses = ('DRAFT', 'SENT')

    items = QuotationItemSerializer(many=True)

    class Meta:
        model = Quotation
        fields = DOCUMENT_FIELDS + ['customer', 'customer_name', 'valid_until', 'status', 'items']
        read_only_fields = DOCUMENT_READ_ONLY + ['status']


# ---------- Sales Orders ----------

class SalesOrderItemSerializer(TaxLineSerializer):
    pending_quantity = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SalesOrderItem
        fields = LINE_FIELDS + ['invoiced_quantity', 'pending_quantity']
        read_only_fields = LINE_READ_ONLY + ['invoiced_quantity']


class SalesOrderSerializer(_CustomerDocumentSerializer):
    number_prefix = 'SO-'
    line_parent_field = 'order'
    company_fields = ('warehouse', 'quotation')
    editable_statuses = ('DRAFT',)

    items = SalesOrderItemSerializer(many=True)
    quotation_number = serializers.CharField(source='quotation.number', read_only=True, allow_null=True)

    class Meta:
        model = SalesOrder
        fields = DOCUMENT_FIELDS + [
            'customer', 'customer_name', 'quotation', 'quotation_number', 'warehouse',
            'expected_delivery_date', 'status', 'items',
        ]
        read_only_fields = DOCUMENT_READ_ONLY + ['status']


# ---------- Invoices ----------

class SalesInvoiceItemSerializer(TaxLineSerializer):
    class Meta:
        model = SalesInvoiceItem
        fields = LINE_FIELDS + ['order_item']
        read_only_fields = LINE_READ_ONLY


class SalesInvoiceSerializer(_CustomerDocumentSerializer):
    number_prefix = 'INV-'
    line_parent_field = 'invoice'
    company_fields = ('warehouse', 'sales_order')
    editable_statuses = ()  # posted on creation; cancel and re-issue to correct

    items = SalesInvoiceItemSerializer(many=True)
    sales_order_number = serializers.CharField(source='sales_order.number', read_only=True, allow_null=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SalesInvoice
        fields = DOCUMENT_FIELDS + [
            'customer', 'customer_name', 'sales_order', 'sales_order_number',
            'warehouse', 'warehouse_name', 'due_date',
            'amount_paid', 'balance_due', 'status', 'items',
        ]
        read_only_fields = DOCUMENT_READ_ONLY + ['amount_paid', 'status']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        order = attrs.get('sales_order')
        if order:
            if order.customer_id != attrs['customer'].id:
                raise serializers.ValidationError({'sales_order': 'Sales order is for a different customer.'})
            if order.status not in ('CONFIRMED', 'PARTIALLY_INVOICED'):
                raise serializers.ValidationError(
                    {'sales_order': f'{order.number} is {order.get_status_display()}; only confirmed orders can be invoiced.'}
                )
        for item in attrs['items']:
            order_item = item.get('order_item')
            if order_item:
                if not order or order_item.order_id != order.id:
                    raise serializers.ValidationError({'items': 'Order line does not belong to the selected sales order.'})
                if order_item.product_id != item['product'].id:
                    raise serializers.ValidationError({'items': 'Order line product does not match.'})
        return attrs

    def after_create(self, invoice, lines):
        user = self.context['request'].user
        for line in lines:
            post_stock(
                company=invoice.company, product=line.product, warehouse=invoice.warehouse,
                quantity=-line.quantity, movement_type='SALE_OUT',
                note=f'Invoice {invoice.number}', user=user,
            )
            if line.order_item_id:
                order_item = SalesOrderItem.objects.select_for_update().get(pk=line.order_item_id)
                if order_item.invoiced_quantity + line.quantity > order_item.quantity:
                    raise serializers.ValidationError(
                        {'items': f'{line.product.name}: invoicing {line.quantity} exceeds pending '
                                  f'{order_item.pending_quantity} on {invoice.sales_order.number}.'}
                    )
                order_item.invoiced_quantity += line.quantity
                order_item.save(update_fields=['invoiced_quantity'])
        if invoice.sales_order:
            invoice.sales_order.refresh_invoice_status()
