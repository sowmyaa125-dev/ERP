from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            'id', 'company', 'branch', 'name', 'code', 'email', 'phone',
            'address', 'state', 'district', 'pin_code', 'gst_number',
            'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_company(self, company):
        from companies.permissions import get_visible_company_ids
        request = self.context['request']
        if company.id not in get_visible_company_ids(request.user):
            raise serializers.ValidationError('You do not have access to this company.')
        return company

    def validate_branch(self, branch):
        if branch is None:
            return branch
        from companies.permissions import get_visible_branch_ids
        request = self.context['request']
        branch_ids = get_visible_branch_ids(request.user)
        if branch_ids is not None and branch.id not in branch_ids:
            raise serializers.ValidationError('You do not have access to this branch.')
        return branch