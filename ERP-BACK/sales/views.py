from django.db import transaction
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.scoping import ScopedQuerysetMixin
from common.services import post_stock

from .models import Quotation, SalesInvoice, SalesOrder, SalesOrderItem
from .serializers import QuotationSerializer, SalesInvoiceSerializer, SalesOrderSerializer


def _set_status(view, request, allowed_from, new_status):
    doc = view.get_object()
    if doc.status not in allowed_from:
        raise serializers.ValidationError(f'{doc.number} is {doc.get_status_display()}.')
    doc.status = new_status
    doc.updated_by = request.user
    doc.save(update_fields=['status', 'updated_by', 'updated_at'])
    return Response(view.get_serializer(doc).data)


class QuotationViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = QuotationSerializer
    queryset = Quotation.objects.select_related('company', 'customer').prefetch_related('items__product__unit')
    extra_filter_fields = ('customer',)

    def perform_destroy(self, instance):
        if instance.status not in ('DRAFT', 'SENT', 'REJECTED'):
            raise serializers.ValidationError(f'{instance.number} is {instance.get_status_display()} and cannot be deleted.')
        instance.delete()

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        return _set_status(self, request, ('DRAFT',), 'SENT')

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        return _set_status(self, request, ('DRAFT', 'SENT'), 'ACCEPTED')

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return _set_status(self, request, ('DRAFT', 'SENT'), 'REJECTED')

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        """Create a draft sales order from this quotation."""
        quotation = self.get_object()
        if quotation.status not in ('DRAFT', 'SENT', 'ACCEPTED'):
            raise serializers.ValidationError(f'{quotation.number} is {quotation.get_status_display()}.')
        data = {
            'company': quotation.company_id,
            'branch': quotation.branch_id,
            'customer': quotation.customer_id,
            'quotation': quotation.id,
            'notes': quotation.notes,
            'items': [
                {
                    'product': i.product_id, 'description': i.description, 'hsn_code': i.hsn_code,
                    'quantity': i.quantity, 'rate': i.rate,
                    'discount_percent': i.discount_percent, 'gst_percent': i.gst_percent,
                }
                for i in quotation.items.all()
            ],
        }
        order_serializer = SalesOrderSerializer(data=data, context=self.get_serializer_context())
        order_serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            order = order_serializer.save()
            quotation.status = 'CONVERTED'
            quotation.updated_by = request.user
            quotation.save(update_fields=['status', 'updated_by', 'updated_at'])
        return Response(SalesOrderSerializer(order, context=self.get_serializer_context()).data,
                        status=status.HTTP_201_CREATED)


class SalesOrderViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = SalesOrderSerializer
    queryset = SalesOrder.objects.select_related('company', 'customer', 'quotation').prefetch_related('items__product__unit')
    extra_filter_fields = ('customer',)

    def perform_destroy(self, instance):
        if instance.status != 'DRAFT':
            raise serializers.ValidationError('Only draft orders can be deleted. Cancel it instead.')
        instance.delete()

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        return _set_status(self, request, ('DRAFT',), 'CONFIRMED')

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        return _set_status(self, request, ('DRAFT', 'CONFIRMED'), 'CANCELLED')


class SalesInvoiceViewSet(
    ScopedQuerysetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
    mixins.RetrieveModelMixin, viewsets.GenericViewSet,
):
    serializer_class = SalesInvoiceSerializer
    queryset = SalesInvoice.objects.select_related(
        'company', 'branch', 'customer', 'warehouse', 'sales_order'
    ).prefetch_related('items__product__unit')
    extra_filter_fields = ('customer',)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status == 'CANCELLED':
            raise serializers.ValidationError(f'{invoice.number} is already cancelled.')
        if invoice.amount_paid > 0:
            raise serializers.ValidationError('This invoice has receipts recorded against it. Cancel those receipts first.')

        with transaction.atomic():
            for line in invoice.items.select_related('product'):
                post_stock(
                    company=invoice.company, product=line.product, warehouse=invoice.warehouse,
                    quantity=line.quantity, movement_type='SALE_OUT',
                    note=f'Cancelled invoice {invoice.number}', user=request.user,
                )
                if line.order_item_id:
                    order_item = SalesOrderItem.objects.select_for_update().get(pk=line.order_item_id)
                    order_item.invoiced_quantity -= line.quantity
                    order_item.save(update_fields=['invoiced_quantity'])
            invoice.status = 'CANCELLED'
            invoice.updated_by = request.user
            invoice.save(update_fields=['status', 'updated_by', 'updated_at'])
            if invoice.sales_order:
                invoice.sales_order.refresh_invoice_status()
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=['get'])
    def print_data(self, request, pk=None):
        """Everything the printable GST invoice needs in one response."""
        invoice = self.get_object()
        company, customer, branch = invoice.company, invoice.customer, invoice.branch
        seller = branch or company
        return Response({
            'invoice': self.get_serializer(invoice).data,
            'seller': {
                'name': company.legal_name or company.name,
                'address': seller.address, 'district': seller.district, 'state': seller.state,
                'pin_code': seller.pin_code, 'phone': seller.phone, 'email': seller.email,
                'gst_number': seller.gst_number or company.gst_number,
            },
            'buyer': {
                'name': customer.name, 'address': customer.address, 'district': customer.district,
                'state': customer.state, 'pin_code': customer.pin_code, 'phone': customer.phone,
                'gst_number': customer.gst_number,
            },
        })
