from rest_framework import serializers

from companies.permissions import get_visible_company_ids

from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            'id', 'company', 'code', 'name', 'product_type', 'description',
            'brand', 'group', 'sub_group', 'category', 'sub_category', 'unit',
            'cost_price', 'purchase_price', 'selling_price', 'mrp',
            'tax_type', 'gst_master', 'gst_type', 'hsn_code',
            'opening_stock', 'opening_stock_date', 'minimum_quantity', 'minimum_order_quantity',
            'barcode', 'discount_allowed', 'warranty_period', 'image',
            'status', 'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_company(self, company):
        request = self.context['request']
        if company.id not in get_visible_company_ids(request.user):
            raise serializers.ValidationError('You do not have access to this company.')
        return company

    def validate(self, attrs):
        company = attrs.get('company') or getattr(self.instance, 'company', None)

        def _same_company(field_name, related_field='company_id'):
            obj = attrs.get(field_name, getattr(self.instance, field_name, None) if self.instance else None)
            if obj and company and getattr(obj, related_field) != company.id:
                raise serializers.ValidationError(
                    {field_name: f'{field_name.replace("_", " ").title()} must belong to the same company.'}
                )

        _same_company('brand')
        _same_company('group')
        _same_company('category')
        _same_company('unit')
        _same_company('gst_master')

        # sub_group must belong to the selected group; sub_category to the selected category
        group = attrs.get('group', getattr(self.instance, 'group', None) if self.instance else None)
        sub_group = attrs.get('sub_group', getattr(self.instance, 'sub_group', None) if self.instance else None)
        if sub_group and group and sub_group.group_id != group.id:
            raise serializers.ValidationError({'sub_group': 'Sub Group must belong to the selected Group.'})

        category = attrs.get('category', getattr(self.instance, 'category', None) if self.instance else None)
        sub_category = attrs.get('sub_category', getattr(self.instance, 'sub_category', None) if self.instance else None)
        if sub_category and category and sub_category.category_id != category.id:
            raise serializers.ValidationError({'sub_category': 'Sub Category must belong to the selected Category.'})

        return attrs