from rest_framework import serializers

from companies.permissions import get_visible_company_ids
from .models import Brand, Category, GSTMaster, Group, SubCategory, SubGroup, UnitMaster, Warehouse


class ScopedCompanySerializer(serializers.ModelSerializer):
    """Base: validates `company` against the requesting user's visible scope."""

    def validate_company(self, company):
        request = self.context['request']
        if company.id not in get_visible_company_ids(request.user):
            raise serializers.ValidationError('You do not have access to this company.')
        return company


class GroupSerializer(ScopedCompanySerializer):
    class Meta:
        model = Group
        fields = ['id', 'company', 'name', 'status']
        read_only_fields = ['id']


class SubGroupSerializer(ScopedCompanySerializer):
    class Meta:
        model = SubGroup
        fields = ['id', 'company', 'group', 'name', 'status']
        read_only_fields = ['id']

    def validate(self, attrs):
        company = attrs.get('company') or getattr(self.instance, 'company', None)
        group = attrs.get('group') or getattr(self.instance, 'group', None)
        if group and company and group.company_id != company.id:
            raise serializers.ValidationError({'group': 'Group must belong to the same company.'})
        return attrs


class CategorySerializer(ScopedCompanySerializer):
    class Meta:
        model = Category
        fields = ['id', 'company', 'name', 'status']
        read_only_fields = ['id']


class SubCategorySerializer(ScopedCompanySerializer):
    class Meta:
        model = SubCategory
        fields = ['id', 'company', 'category', 'name', 'status']
        read_only_fields = ['id']

    def validate(self, attrs):
        company = attrs.get('company') or getattr(self.instance, 'company', None)
        category = attrs.get('category') or getattr(self.instance, 'category', None)
        if category and company and category.company_id != company.id:
            raise serializers.ValidationError({'category': 'Category must belong to the same company.'})
        return attrs


class BrandSerializer(ScopedCompanySerializer):
    class Meta:
        model = Brand
        fields = ['id', 'company', 'name', 'status']
        read_only_fields = ['id']


class GSTMasterSerializer(ScopedCompanySerializer):
    class Meta:
        model = GSTMaster
        fields = ['id', 'company', 'name', 'percentage', 'status']
        read_only_fields = ['id']


class UnitMasterSerializer(ScopedCompanySerializer):
    class Meta:
        model = UnitMaster
        fields = ['id', 'company', 'name', 'short_name', 'status']
        read_only_fields = ['id']


class WarehouseSerializer(ScopedCompanySerializer):
    class Meta:
        model = Warehouse
        fields = [
            'id', 'company', 'branch', 'name', 'code', 'status',
        ]
        read_only_fields = ['id']

    def validate_branch(self, branch):
        if branch is None:
            return branch
        from companies.permissions import get_visible_branch_ids
        request = self.context['request']
        branch_ids = get_visible_branch_ids(request.user)
        if branch_ids is not None and branch.id not in branch_ids:
            raise serializers.ValidationError('You do not have access to this branch.')
        return branch

    def validate(self, attrs):
        company = attrs.get('company') or getattr(self.instance, 'company', None)
        branch = attrs.get('branch') or getattr(self.instance, 'branch', None)
        if branch and company and branch.company_id != company.id:
            raise serializers.ValidationError({'branch': 'Branch must belong to the same company.'})
        return attrs