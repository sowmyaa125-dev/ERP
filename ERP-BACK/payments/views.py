from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.scoping import ScopedQuerysetMixin
from companies.permissions import get_visible_branch_ids, get_visible_company_ids
from customers.models import Customer
from purchases.models import PurchaseBill
from sales.models import SalesInvoice
from suppliers.models import Supplier

from .models import Payment
from .serializers import PaymentSerializer

ZERO = Decimal('0')

# Per party type: (party model, document model, payment type, payment FK on Payment, allocation field)
PARTY_CONFIG = {
    'customer': (Customer, SalesInvoice, 'RECEIPT', 'customer', 'sales_invoice'),
    'supplier': (Supplier, PurchaseBill, 'PAYMENT', 'supplier', 'purchase_bill'),
}


def _scope(qs, user, company_param=None):
    qs = qs.filter(company_id__in=get_visible_company_ids(user))
    branch_ids = get_visible_branch_ids(user)
    if branch_ids is not None:
        qs = qs.filter(branch_id__in=branch_ids)
    if company_param:
        qs = qs.filter(company_id=company_param)
    return qs


class PaymentViewSet(
    ScopedQuerysetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
    mixins.RetrieveModelMixin, viewsets.GenericViewSet,
):
    serializer_class = PaymentSerializer
    queryset = Payment.objects.select_related('customer', 'supplier').prefetch_related(
        'allocations__sales_invoice', 'allocations__purchase_bill'
    )
    extra_filter_fields = ('payment_type', 'customer', 'supplier', 'mode')

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        payment = self.get_object()
        if payment.status == 'CANCELLED':
            raise serializers.ValidationError(f'{payment.number} is already cancelled.')
        with transaction.atomic():
            payment.status = 'CANCELLED'
            payment.save(update_fields=['status', 'updated_at'])
            for alloc in payment.allocations.all():
                if alloc.sales_invoice_id:
                    alloc.sales_invoice.refresh_payment_status('sales_invoice')
                else:
                    alloc.purchase_bill.refresh_payment_status('purchase_bill')
        return Response(self.get_serializer(payment).data)


class PartyLedgerView(APIView):
    """
    GET /api/ledger/?party_type=customer|supplier&party=<id>&date_from=&date_to=
    Customer: invoices are debits, receipts credits; balance = amount they owe us.
    Supplier: bills are credits, payments debits; balance = amount we owe them.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        party_type = request.query_params.get('party_type')
        if party_type not in PARTY_CONFIG:
            raise serializers.ValidationError({'party_type': 'Use "customer" or "supplier".'})
        party_model, doc_model, payment_type, party_fk, _ = PARTY_CONFIG[party_type]
        party = get_object_or_404(
            _scope(party_model.objects.all(), request.user), pk=request.query_params.get('party')
        )
        is_customer = party_type == 'customer'

        entries = []
        for doc in doc_model.objects.filter(**{party_fk: party}).exclude(status='CANCELLED'):
            amount = doc.grand_total
            entries.append({
                'date': doc.date, 'created_at': doc.created_at,
                'type': 'Invoice' if is_customer else 'Bill',
                'number': doc.number,
                'reference': getattr(doc, 'supplier_invoice_number', '') or '',
                'debit': amount if is_customer else ZERO,
                'credit': ZERO if is_customer else amount,
            })
        for pay in Payment.objects.filter(**{party_fk: party}, payment_type=payment_type, status='ACTIVE'):
            entries.append({
                'date': pay.date, 'created_at': pay.created_at,
                'type': 'Receipt' if is_customer else 'Payment',
                'number': pay.number,
                'reference': ' '.join(filter(None, [pay.get_mode_display(), pay.reference])),
                'debit': ZERO if is_customer else pay.amount,
                'credit': pay.amount if is_customer else ZERO,
            })
        entries.sort(key=lambda e: (e['date'], e['created_at']))

        def signed(e):
            return e['debit'] - e['credit'] if is_customer else e['credit'] - e['debit']

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        opening = sum((signed(e) for e in entries if date_from and str(e['date']) < date_from), ZERO)
        visible = [
            e for e in entries
            if not (date_from and str(e['date']) < date_from) and not (date_to and str(e['date']) > date_to)
        ]

        balance = opening
        for e in visible:
            balance += signed(e)
            e['balance'] = balance
            del e['created_at']

        return Response({
            'party': {'id': party.id, 'name': party.name, 'type': party_type, 'gst_number': party.gst_number},
            'opening_balance': opening,
            'entries': visible,
            'total_debit': sum((e['debit'] for e in visible), ZERO),
            'total_credit': sum((e['credit'] for e in visible), ZERO),
            'closing_balance': balance,
        })


class OutstandingView(APIView):
    """
    GET /api/outstanding/?type=receivable|payable&company=
    Open invoices/bills with ageing buckets, plus a per-party summary
    that nets off unallocated advances.
    """
    permission_classes = [permissions.IsAuthenticated]

    BUCKETS = ('current', '1_30', '31_60', '61_90', 'over_90')

    @classmethod
    def bucket_for(cls, days_overdue):
        if days_overdue <= 0:
            return 'current'
        if days_overdue <= 30:
            return '1_30'
        if days_overdue <= 60:
            return '31_60'
        if days_overdue <= 90:
            return '61_90'
        return 'over_90'

    def get(self, request):
        kind = request.query_params.get('type', 'receivable')
        if kind not in ('receivable', 'payable'):
            raise serializers.ValidationError({'type': 'Use "receivable" or "payable".'})
        party_type = 'customer' if kind == 'receivable' else 'supplier'
        _, doc_model, payment_type, party_fk, _ = PARTY_CONFIG[party_type]
        company_param = request.query_params.get('company')
        today = timezone.localdate()

        docs = _scope(doc_model.objects.select_related(party_fk), request.user, company_param).filter(
            status__in=('UNPAID', 'PARTIALLY_PAID')
        ).order_by('date', 'id')

        parties = {}

        def party_row(party):
            if party.id not in parties:
                parties[party.id] = {
                    'party_id': party.id, 'party_name': party.name,
                    'total_due': ZERO, 'advance': ZERO, **{b: ZERO for b in self.BUCKETS},
                }
            return parties[party.id]

        documents = []
        for doc in docs:
            party = getattr(doc, party_fk)
            balance = doc.grand_total - doc.amount_paid
            ref_date = doc.due_date or doc.date
            days_overdue = (today - ref_date).days
            bucket = self.bucket_for(days_overdue)
            documents.append({
                'id': doc.id, 'number': doc.number, 'date': doc.date, 'due_date': doc.due_date,
                'party_id': party.id, 'party_name': party.name,
                'grand_total': doc.grand_total, 'amount_paid': doc.amount_paid, 'balance_due': balance,
                'days_overdue': max(days_overdue, 0), 'bucket': bucket,
            })
            row = party_row(party)
            row['total_due'] += balance
            row[bucket] += balance

        zero = Value(ZERO, output_field=DecimalField(max_digits=14, decimal_places=2))
        advances = (
            _scope(Payment.objects.select_related(party_fk), request.user, company_param)
            .filter(payment_type=payment_type, status='ACTIVE')
            .annotate(allocated=Coalesce(Sum('allocations__amount'), zero))
            .filter(amount__gt=F('allocated'))
        )
        for pay in advances:
            party_row(getattr(pay, party_fk))['advance'] += pay.amount - pay.allocated

        summary = sorted(parties.values(), key=lambda r: r['party_name'].lower())
        for row in summary:
            row['net_due'] = row['total_due'] - row['advance']

        totals = defaultdict(lambda: ZERO)
        for row in summary:
            for key in ('total_due', 'advance', 'net_due', *self.BUCKETS):
                totals[key] += row[key]

        return Response({'type': kind, 'documents': documents, 'parties': summary, 'totals': totals})
