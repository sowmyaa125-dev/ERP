from django.db import transaction
from rest_framework import serializers

from companies.models import Company
from companies.permissions import get_visible_company_ids
from masters.models import Warehouse
from products.models import Product

from .models import Stock, StockMovement


class StockSerializer(serializers.ModelSerializer):
    """Read-only current balance view."""
    product_name = serializers.CharField(source='product.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    class Meta:
        model = Stock
        fields = ['id', 'company', 'product', 'product_name', 'warehouse', 'warehouse_name', 'quantity', 'updated_at']
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    """Read-only ledger view."""
    class Meta:
        model = StockMovement
        fields = [
            'id', 'company', 'product', 'warehouse', 'movement_type',
            'quantity', 'reference_note', 'transfer_group', 'created_at',
        ]
        read_only_fields = fields


class _ScopedStockOperationSerializer(serializers.Serializer):
    def _check_scope(self, company, product, warehouse):
        request = self.context['request']
        visible = get_visible_company_ids(request.user)
        if company.id not in visible:
            raise serializers.ValidationError({'company': 'You do not have access to this company.'})
        if product.company_id != company.id:
            raise serializers.ValidationError({'product': 'Product must belong to the selected company.'})
        if warehouse.company_id != company.id:
            raise serializers.ValidationError({'warehouse': 'Warehouse must belong to the selected company.'})


class OpeningStockSerializer(_ScopedStockOperationSerializer):
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all())
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    quantity = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        self._check_scope(attrs['company'], attrs['product'], attrs['warehouse'])
        existing = StockMovement.objects.filter(
            product=attrs['product'], warehouse=attrs['warehouse'], movement_type='OPENING'
        ).exists()
        if existing:
            raise serializers.ValidationError('Opening stock has already been recorded for this product/warehouse.')
        return attrs

    def create(self, validated_data):
        return StockMovement.objects.create(
            company=validated_data['company'],
            product=validated_data['product'],
            warehouse=validated_data['warehouse'],
            movement_type='OPENING',
            quantity=validated_data['quantity'],
            reference_note=validated_data.get('note', ''),
            created_by=self.context['request'].user,
        )


class StockAdjustmentSerializer(_ScopedStockOperationSerializer):
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all())
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    quantity = serializers.DecimalField(max_digits=14, decimal_places=2, help_text='Signed: positive to add, negative to remove.')
    note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        self._check_scope(attrs['company'], attrs['product'], attrs['warehouse'])
        return attrs

    def create(self, validated_data):
        return StockMovement.objects.create(
            company=validated_data['company'],
            product=validated_data['product'],
            warehouse=validated_data['warehouse'],
            movement_type='ADJUSTMENT',
            quantity=validated_data['quantity'],
            reference_note=validated_data.get('note', ''),
            created_by=self.context['request'].user,
        )


class StockTransferSerializer(_ScopedStockOperationSerializer):
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all())
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    from_warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    to_warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.all())
    quantity = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0)
    note = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['from_warehouse'].id == attrs['to_warehouse'].id:
            raise serializers.ValidationError('Source and destination warehouse must differ.')
        self._check_scope(attrs['company'], attrs['product'], attrs['from_warehouse'])
        self._check_scope(attrs['company'], attrs['product'], attrs['to_warehouse'])

        current = Stock.objects.filter(product=attrs['product'], warehouse=attrs['from_warehouse']).first()
        available = current.quantity if current else 0
        if available < attrs['quantity']:
            raise serializers.ValidationError(
                f"Insufficient stock at source warehouse: available {available}, requested {attrs['quantity']}."
            )
        return attrs

    def create(self, validated_data):
        import uuid

        group_id = str(uuid.uuid4())
        user = self.context['request'].user

        with transaction.atomic():
            out_move = StockMovement.objects.create(
                company=validated_data['company'],
                product=validated_data['product'],
                warehouse=validated_data['from_warehouse'],
                movement_type='TRANSFER_OUT',
                quantity=-validated_data['quantity'],
                reference_note=validated_data.get('note', ''),
                transfer_group=group_id,
                created_by=user,
            )
            in_move = StockMovement.objects.create(
                company=validated_data['company'],
                product=validated_data['product'],
                warehouse=validated_data['to_warehouse'],
                movement_type='TRANSFER_IN',
                quantity=validated_data['quantity'],
                reference_note=validated_data.get('note', ''),
                transfer_group=group_id,
                created_by=user,
            )
        return {'out': out_move, 'in': in_move, 'transfer_group': group_id}