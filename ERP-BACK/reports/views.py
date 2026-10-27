"""
Read-only reporting endpoints. Every query is scoped to the companies and
branches the user's role can see; all accept ?company= to narrow further.
Cancelled documents are excluded everywhere.
"""
from datetime import date
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from companies.permissions import get_visible_branch_ids, get_visible_company_ids
from products.models import Product
from purchases.models import PurchaseBill, PurchaseBillItem
from sales.models import SalesInvoice, SalesInvoiceItem
from stock.models import Stock

ZERO = Decimal('0')
DEC = DecimalField(max_digits=16, decimal_places=2)


def _sum(field):
    return Coalesce(Sum(field), Value(ZERO, output_field=DEC), output_field=DEC)


class ReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def scoped(self, qs, prefix='', branch=True):
        user, params = self.request.user, self.request.query_params
        qs = qs.filter(**{f'{prefix}company_id__in': get_visible_company_ids(user)})
        branch_ids = get_visible_branch_ids(user) if branch else None
        if branch_ids is not None:
            qs = qs.filter(**{f'{prefix}branch_id__in': branch_ids})
        if params.get('company'):
            qs = qs.filter(**{f'{prefix}company_id': params['company']})
        return qs

    def dated(self, qs, prefix=''):
        params = self.request.query_params
        if params.get('date_from'):
            qs = qs.filter(**{f'{prefix}date__gte': params['date_from']})
        if params.get('date_to'):
            qs = qs.filter(**{f'{prefix}date__lte': params['date_to']})
        return qs

    def active_invoices(self):
        return self.scoped(SalesInvoice.objects.exclude(status='CANCELLED'))

    def active_bills(self):
        return self.scoped(PurchaseBill.objects.exclude(status='CANCELLED'))


def _register(qs, party_field):
    rows = list(
        qs.select_related(party_field).order_by('date', 'id').values(
            'id', 'number', 'date', 'status', f'{party_field}__name', f'{party_field}__gst_number',
            'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'grand_total', 'amount_paid',
        )
    )
    for r in rows:
        r['party_name'] = r.pop(f'{party_field}__name')
        r['party_gst_number'] = r.pop(f'{party_field}__gst_number')
        r['balance_due'] = r['grand_total'] - r['amount_paid']
    totals = qs.aggregate(
        count=Count('id'),
        taxable_amount=_sum('taxable_amount'), cgst_amount=_sum('cgst_amount'),
        sgst_amount=_sum('sgst_amount'), igst_amount=_sum('igst_amount'),
        grand_total=_sum('grand_total'), amount_paid=_sum('amount_paid'),
    )
    totals['balance_due'] = totals['grand_total'] - totals['amount_paid']
    return {'rows': rows, 'totals': totals}


class SalesReportView(ReportView):
    """GET /api/reports/sales/?date_from=&date_to=&company=&customer="""

    def get(self, request):
        qs = self.dated(self.active_invoices())
        if request.query_params.get('customer'):
            qs = qs.filter(customer_id=request.query_params['customer'])
        data = _register(qs, 'customer')

        items = self.dated(
            self.scoped(SalesInvoiceItem.objects.exclude(invoice__status='CANCELLED'), 'invoice__'), 'invoice__'
        )
        if request.query_params.get('customer'):
            items = items.filter(invoice__customer_id=request.query_params['customer'])
        data['by_product'] = list(
            items.values('product_id', name=F('product__name'), code=F('product__code'))
            .annotate(quantity=_sum('quantity'), taxable_amount=_sum('taxable_amount'), total_amount=_sum('total_amount'))
            .order_by('-taxable_amount')
        )
        return Response(data)


class PurchaseReportView(ReportView):
    """GET /api/reports/purchases/?date_from=&date_to=&company=&supplier="""

    def get(self, request):
        qs = self.dated(self.active_bills())
        if request.query_params.get('supplier'):
            qs = qs.filter(supplier_id=request.query_params['supplier'])
        data = _register(qs, 'supplier')
        bill_refs = dict(qs.values_list('id', 'supplier_invoice_number'))
        for r in data['rows']:
            r['supplier_invoice_number'] = bill_refs.get(r['id'])
        return Response(data)


class GSTReportView(ReportView):
    """
    GET /api/reports/gst/?date_from=&date_to=&company=
    Rate-wise outward (sales) and inward (purchase) tax, HSN summary of
    sales, and the net GST payable (output tax minus input tax credit).
    """

    def _rate_wise(self, items):
        return list(
            items.values('gst_percent')
            .annotate(
                taxable_amount=_sum('taxable_amount'), cgst_amount=_sum('cgst_amount'),
                sgst_amount=_sum('sgst_amount'), igst_amount=_sum('igst_amount'),
            )
            .order_by('gst_percent')
        )

    @staticmethod
    def _total(rows):
        keys = ('taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount')
        totals = {k: sum((r[k] for r in rows), ZERO) for k in keys}
        totals['total_tax'] = totals['cgst_amount'] + totals['sgst_amount'] + totals['igst_amount']
        return totals

    def get(self, request):
        outward_items = self.dated(
            self.scoped(SalesInvoiceItem.objects.exclude(invoice__status='CANCELLED'), 'invoice__'), 'invoice__'
        )
        inward_items = self.dated(
            self.scoped(PurchaseBillItem.objects.exclude(bill__status='CANCELLED'), 'bill__'), 'bill__'
        )

        outward = self._rate_wise(outward_items)
        inward = self._rate_wise(inward_items)
        out_total, in_total = self._total(outward), self._total(inward)

        hsn = list(
            outward_items.values('hsn_code', 'gst_percent')
            .annotate(
                quantity=_sum('quantity'), taxable_amount=_sum('taxable_amount'),
                cgst_amount=_sum('cgst_amount'), sgst_amount=_sum('sgst_amount'), igst_amount=_sum('igst_amount'),
            )
            .order_by('hsn_code', 'gst_percent')
        )

        net = {
            k: out_total[k] - in_total[k]
            for k in ('cgst_amount', 'sgst_amount', 'igst_amount', 'total_tax')
        }
        return Response({
            'outward': outward, 'outward_total': out_total,
            'inward': inward, 'inward_total': in_total,
            'hsn_summary': hsn,
            'net_payable': net,
        })


class StockReportView(ReportView):
    """
    GET /api/reports/stock/?company=&warehouse=
    Balance per product/warehouse valued at purchase price, plus a
    low-stock list comparing each product's total against its minimum.
    """

    def get(self, request):
        balances = self.scoped(
            Stock.objects.select_related('product__unit', 'warehouse'), branch=False
        ).order_by('product__name', 'warehouse__name')
        if request.query_params.get('warehouse'):
            balances = balances.filter(warehouse_id=request.query_params['warehouse'])

        rows, totals_by_product = [], {}
        total_value = ZERO
        for s in balances:
            p = s.product
            rate = p.purchase_price or p.cost_price or ZERO
            value = (s.quantity * rate).quantize(Decimal('0.01'))
            total_value += value
            totals_by_product[p.id] = totals_by_product.get(p.id, ZERO) + s.quantity
            rows.append({
                'product_id': p.id, 'product_name': p.name, 'product_code': p.code,
                'unit': p.unit.short_name if p.unit else '',
                'warehouse_id': s.warehouse_id, 'warehouse_name': s.warehouse.name,
                'quantity': s.quantity, 'rate': rate, 'value': value,
            })

        products = self.scoped(Product.objects.filter(status=True, product_type='GOODS'), branch=False)
        low_stock = []
        for p in products.select_related('unit').order_by('name'):
            on_hand = totals_by_product.get(p.id, ZERO)
            if p.minimum_quantity and on_hand < p.minimum_quantity:
                low_stock.append({
                    'product_id': p.id, 'product_name': p.name, 'product_code': p.code,
                    'unit': p.unit.short_name if p.unit else '',
                    'on_hand': on_hand, 'minimum_quantity': p.minimum_quantity,
                    'reorder_quantity': max(p.minimum_quantity - on_hand, p.minimum_order_quantity or ZERO),
                })

        return Response({'rows': rows, 'total_value': total_value, 'low_stock': low_stock})


class DashboardView(ReportView):
    """GET /api/reports/dashboard/?company= — headline numbers and trends."""

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        invoices, bills = self.active_invoices(), self.active_bills()

        def month_total(qs):
            return qs.filter(date__gte=month_start, date__lte=today).aggregate(t=_sum('grand_total'))['t']

        def outstanding(qs):
            agg = qs.aggregate(total=_sum('grand_total'), paid=_sum('amount_paid'))
            return agg['total'] - agg['paid']

        # Six calendar months including the current one.
        y, m = today.year, today.month - 5
        while m <= 0:
            y, m = y - 1, m + 12
        trend_start = date(y, m, 1)
        months = []
        for _ in range(6):
            months.append(date(y, m, 1))
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)

        def by_month(qs):
            rows = (
                qs.filter(date__gte=trend_start).annotate(month=TruncMonth('date'))
                .values('month').annotate(total=_sum('grand_total'))
            )
            return {r['month'].strftime('%Y-%m'): r['total'] for r in rows}

        sales_by_month, purchases_by_month = by_month(invoices), by_month(bills)
        trend = [
            {
                'month': d.strftime('%b %Y'),
                'sales': sales_by_month.get(d.strftime('%Y-%m'), ZERO),
                'purchases': purchases_by_month.get(d.strftime('%Y-%m'), ZERO),
            }
            for d in months
        ]

        top_products = list(
            self.scoped(SalesInvoiceItem.objects.exclude(invoice__status='CANCELLED'), 'invoice__')
            .filter(invoice__date__gte=trend_start)
            .values(name=F('product__name'))
            .annotate(quantity=_sum('quantity'), amount=_sum('taxable_amount'))
            .order_by('-amount')[:5]
        )

        recent_invoices = list(
            invoices.select_related('customer').order_by('-date', '-id')[:5].values(
                'id', 'number', 'date', 'grand_total', 'status', customer_name=F('customer__name'),
            )
        )

        stock_report = StockReportView()
        stock_report.request = request
        stock_data = stock_report.get(request).data

        return Response({
            'sales_this_month': month_total(invoices),
            'purchases_this_month': month_total(bills),
            'receivables': outstanding(invoices),
            'payables': outstanding(bills),
            'stock_value': stock_data['total_value'],
            'low_stock_count': len(stock_data['low_stock']),
            'low_stock': stock_data['low_stock'][:5],
            'invoices_this_month': invoices.filter(date__gte=month_start).count(),
            'trend': trend,
            'top_products': top_products,
            'recent_invoices': recent_invoices,
        })
