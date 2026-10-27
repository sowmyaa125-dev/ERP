from django.db import transaction
from rest_framework import serializers

from common.scoping import check_branch_access, check_company_access, check_same_company
from common.serializers import (
    DOCUMENT_FIELDS, DOCUMENT_READ_ONLY, LINE_FIELDS, LINE_READ_ONLY,
    TaxDocumentSerializer, TaxLineSerializer,
)
from common.services import next_document_number, post_stock

from .models import (
    GoodsReceipt, GoodsReceiptItem, PurchaseBill, PurchaseBillItem,
    PurchaseOrder, PurchaseOrderItem,
)


# ---------- Purchase Orders ----------

class PurchaseOrderItemSerializer(TaxLineSerializer):
    pending_quantity = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = LINE_FIELDS + ['received_quantity', 'pending_quantity']
        read_only_fields = LINE_READ_ONLY + ['received_quantity']


class PurchaseOrderSerializer(TaxDocumentSerializer):
    number_prefix = 'PO-'
    party_field = 'supplier'
    line_parent_field = 'order'
    company_fields = ('warehouse',)
    editable_statuses = ('DRAFT',)

    items = PurchaseOrderItemSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = DOCUMENT_FIELDS + [
            'supplier', 'supplier_name', 'warehouse', 'expected_date', 'status', 'items',
        ]
        read_only_fields = DOCUMENT_READ_ONLY + ['status']


# ---------- Goods Receipts ----------

class GoodsReceiptItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    unit_name = serializers.CharField(source='product.unit.short_name', read_only=True, allow_null=True)

    class Meta:
        model = GoodsReceiptItem
        fields = ['id', 'product', 'product_name', 'unit_name', 'order_item', 'quantity']
        read_only_fields = ['id']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        return value


class GoodsReceiptSerializer(serializers.ModelSerializer):
    items = GoodsReceiptItemSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    purchase_order_number = serializers.CharField(source='purchase_order.number', read_only=True, allow_null=True)

    class Meta:
        model = GoodsReceipt
        fields = [
            'id', 'company', 'branch', 'number', 'date', 'supplier', 'supplier_name',
            'warehouse', 'warehouse_name', 'purchase_order', 'purchase_order_number',
            'supplier_reference', 'notes', 'status', 'items', 'created_at',
        ]
        read_only_fields = ['id', 'number', 'status', 'created_at']

    def validate(self, attrs):
        user = self.context['request'].user
        company = attrs['company']
        check_company_access(user, company)
        check_branch_access(user, company, attrs.get('branch'))
        po = attrs.get('purchase_order')
        check_same_company(company, supplier=attrs['supplier'], warehouse=attrs['warehouse'], purchase_order=po)

        if po:
            if po.supplier_id != attrs['supplier'].id:
                raise serializers.ValidationError({'purchase_order': 'Purchase order is for a different supplier.'})
            if po.status not in ('APPROVED', 'PARTIALLY_RECEIVED'):
                raise serializers.ValidationError(
                    {'purchase_order': f'{po.number} is {po.get_status_display()}; only approved orders can be received.'}
                )

        items = attrs.get('items') or []
        if not items:
            raise serializers.ValidationError({'items': 'At least one line item is required.'})
        for item in items:
            if item['product'].company_id != company.id:
                raise serializers.ValidationError({'items': f"{item['product'].name} does not belong to the selected company."})
            order_item = item.get('order_item')
            if order_item:
                if not po or order_item.order_id != po.id:
                    raise serializers.ValidationError({'items': 'Order line does not belong to the selected purchase order.'})
                if order_item.product_id != item['product'].id:
                    raise serializers.ValidationError({'items': 'Order line product does not match.'})
        return attrs

    def create(self, validated_data):
        items = validated_data.pop('items')
        user = self.context['request'].user
        with transaction.atomic():
            validated_data['number'] = next_document_number(GoodsReceipt, validated_data['company'], 'GRN-')
            receipt = GoodsReceipt.objects.create(**validated_data, created_by=user)
            for item in items:
                line = GoodsReceiptItem.objects.create(receipt=receipt, **item)
                if line.order_item_id:
                    order_item = PurchaseOrderItem.objects.select_for_update().get(pk=line.order_item_id)
                    if order_item.received_quantity + line.quantity > order_item.quantity:
                        raise serializers.ValidationError(
                            {'items': f'{order_item.product.name}: receiving {line.quantity} exceeds pending '
                                      f'{order_item.pending_quantity} on {receipt.purchase_order.number}.'}
                        )
                    order_item.received_quantity += line.quantity
                    order_item.save(update_fields=['received_quantity'])
                post_stock(
                    company=receipt.company, product=line.product, warehouse=receipt.warehouse,
                    quantity=line.quantity, movement_type='PURCHASE_IN',
                    note=f'Goods receipt {receipt.number}', user=user,
                )
            if receipt.purchase_order:
                receipt.purchase_order.refresh_receipt_status()
        return receipt


# ---------- Purchase Bills ----------

class PurchaseBillItemSerializer(TaxLineSerializer):
    class Meta:
        model = PurchaseBillItem
        fields = LINE_FIELDS
        read_only_fields = LINE_READ_ONLY


class PurchaseBillSerializer(TaxDocumentSerializer):
    number_prefix = 'PB-'
    party_field = 'supplier'
    line_parent_field = 'bill'
    company_fields = ('warehouse', 'purchase_order', 'goods_receipt')
    editable_statuses = ()  # bills are posted on creation; cancel and re-enter to correct

    items = PurchaseBillItemSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    balance_due = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseBill
        fields = DOCUMENT_FIELDS + [
            'supplier', 'supplier_name', 'supplier_invoice_number', 'due_date',
            'purchase_order', 'goods_receipt', 'update_stock', 'warehouse',
            'amount_paid', 'balance_due', 'status', 'items',
        ]
        read_only_fields = DOCUMENT_READ_ONLY + ['amount_paid', 'status']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        supplier = attrs['supplier']
        for field in ('purchase_order', 'goods_receipt'):
            linked = attrs.get(field)
            if linked and linked.supplier_id != supplier.id:
                raise serializers.ValidationError({field: 'Linked document is for a different supplier.'})
        grn = attrs.get('goods_receipt')
        if grn and grn.status == 'CANCELLED':
            raise serializers.ValidationError({'goods_receipt': f'{grn.number} is cancelled.'})
        if attrs.get('update_stock'):
            if grn:
                raise serializers.ValidationError(
                    {'update_stock': 'Stock was already added by the goods receipt; leave "update stock" off.'}
                )
            if not attrs.get('warehouse'):
                raise serializers.ValidationError({'warehouse': 'Choose the warehouse the goods go into.'})
        duplicate = PurchaseBill.objects.filter(
            supplier=supplier, supplier_invoice_number__iexact=attrs['supplier_invoice_number'],
        ).exclude(status='CANCELLED').first()
        if duplicate:
            raise serializers.ValidationError(
                {'supplier_invoice_number': f'Already entered as {duplicate.number}.'}
            )
        return attrs

    def after_create(self, bill, lines):
        if not bill.update_stock:
            return
        user = self.context['request'].user
        for line in lines:
            post_stock(
                company=bill.company, product=line.product, warehouse=bill.warehouse,
                quantity=line.quantity, movement_type='PURCHASE_IN',
                note=f'Purchase bill {bill.number}', user=user,
            )
