from django.db import transaction
from rest_framework import serializers

from common.scoping import check_branch_access, check_company_access, check_same_company
from common.services import next_document_number
from purchases.models import PurchaseBill
from sales.models import SalesInvoice

from .models import Payment, PaymentAllocation


class PaymentAllocationSerializer(serializers.ModelSerializer):
    document_number = serializers.SerializerMethodField()

    class Meta:
        model = PaymentAllocation
        fields = ['id', 'sales_invoice', 'purchase_bill', 'document_number', 'amount']
        read_only_fields = ['id']

    def get_document_number(self, obj):
        return obj.document.number if obj.document else None

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Allocated amount must be greater than zero.')
        return value


class PaymentSerializer(serializers.ModelSerializer):
    allocations = PaymentAllocationSerializer(many=True, required=False)
    party_name = serializers.SerializerMethodField()
    allocated_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    unallocated_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id', 'company', 'branch', 'number', 'date', 'payment_type',
            'customer', 'supplier', 'party_name', 'amount', 'mode', 'reference', 'notes',
            'status', 'allocations', 'allocated_amount', 'unallocated_amount', 'created_at',
        ]
        read_only_fields = ['id', 'number', 'status', 'created_at']

    def get_party_name(self, obj):
        party = obj.customer or obj.supplier
        return party.name if party else None

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value

    def validate(self, attrs):
        user = self.context['request'].user
        company = attrs['company']
        check_company_access(user, company)
        check_branch_access(user, company, attrs.get('branch'))

        is_receipt = attrs['payment_type'] == 'RECEIPT'
        party_field, other_field = ('customer', 'supplier') if is_receipt else ('supplier', 'customer')
        party = attrs.get(party_field)
        if not party:
            raise serializers.ValidationError({party_field: f'Choose the {party_field}.'})
        if attrs.get(other_field):
            raise serializers.ValidationError({other_field: f'A {attrs["payment_type"].lower()} cannot have a {other_field}.'})
        check_same_company(company, **{party_field: party})

        doc_field, wrong_field = ('sales_invoice', 'purchase_bill') if is_receipt else ('purchase_bill', 'sales_invoice')
        allocations = attrs.get('allocations', [])
        seen = set()
        for alloc in allocations:
            doc = alloc.get(doc_field)
            if not doc or alloc.get(wrong_field):
                raise serializers.ValidationError({'allocations': f'Each allocation must reference a {doc_field.replace("_", " ")}.'})
            if doc.id in seen:
                raise serializers.ValidationError({'allocations': f'{doc.number} is listed twice.'})
            seen.add(doc.id)
            if getattr(doc, f'{party_field}_id') != party.id:
                raise serializers.ValidationError({'allocations': f'{doc.number} belongs to a different {party_field}.'})
        total_allocated = sum((a['amount'] for a in allocations), 0)
        if total_allocated > attrs['amount']:
            raise serializers.ValidationError(
                {'allocations': f'Allocated {total_allocated} is more than the amount {attrs["amount"]}.'}
            )
        return attrs

    def create(self, validated_data):
        allocations = validated_data.pop('allocations', [])
        user = self.context['request'].user
        is_receipt = validated_data['payment_type'] == 'RECEIPT'
        doc_model, doc_field = (SalesInvoice, 'sales_invoice') if is_receipt else (PurchaseBill, 'purchase_bill')

        with transaction.atomic():
            prefix = 'RCPT-' if is_receipt else 'PAY-'
            validated_data['number'] = next_document_number(Payment, validated_data['company'], prefix)
            payment = Payment.objects.create(**validated_data, created_by=user)
            for alloc in allocations:
                doc = doc_model.objects.select_for_update().get(pk=alloc[doc_field].pk)
                if doc.status == 'CANCELLED':
                    raise serializers.ValidationError({'allocations': f'{doc.number} is cancelled.'})
                if alloc['amount'] > doc.balance_due:
                    raise serializers.ValidationError(
                        {'allocations': f'{doc.number}: {alloc["amount"]} is more than the balance due {doc.balance_due}.'}
                    )
                PaymentAllocation.objects.create(payment=payment, amount=alloc['amount'], **{doc_field: doc})
                doc.refresh_payment_status(doc_field)
        return payment
