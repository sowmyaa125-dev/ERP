from django.db import transaction
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.scoping import ScopedQuerysetMixin
from common.services import post_stock

from .models import GoodsReceipt, PurchaseBill, PurchaseOrder, PurchaseOrderItem
from .serializers import GoodsReceiptSerializer, PurchaseBillSerializer, PurchaseOrderSerializer


class PurchaseOrderViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer
    queryset = PurchaseOrder.objects.select_related('company', 'supplier').prefetch_related('items__product__unit')
    extra_filter_fields = ('supplier',)

    def perform_destroy(self, instance):
        if instance.status != 'DRAFT':
            raise serializers.ValidationError('Only draft orders can be deleted. Cancel it instead.')
        instance.delete()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        order = self.get_object()
        if order.status != 'DRAFT':
            raise serializers.ValidationError(f'{order.number} is already {order.get_status_display()}.')
        order.status = 'APPROVED'
        order.updated_by = request.user
        order.save(update_fields=['status', 'updated_by', 'updated_at'])
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status not in ('DRAFT', 'APPROVED'):
            raise serializers.ValidationError(
                f'{order.number} is {order.get_status_display()}; orders with received goods cannot be cancelled.'
            )
        order.status = 'CANCELLED'
        order.updated_by = request.user
        order.save(update_fields=['status', 'updated_by', 'updated_at'])
        return Response(self.get_serializer(order).data)


class GoodsReceiptViewSet(
    ScopedQuerysetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
    mixins.RetrieveModelMixin, viewsets.GenericViewSet,
):
    serializer_class = GoodsReceiptSerializer
    queryset = GoodsReceipt.objects.select_related(
        'supplier', 'warehouse', 'purchase_order'
    ).prefetch_related('items__product__unit')
    extra_filter_fields = ('supplier', 'purchase_order')

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        receipt = self.get_object()
        if receipt.status == 'CANCELLED':
            raise serializers.ValidationError(f'{receipt.number} is already cancelled.')
        active_bill = receipt.bills.exclude(status='CANCELLED').first()
        if active_bill:
            raise serializers.ValidationError(f'Cancel purchase bill {active_bill.number} first.')

        with transaction.atomic():
            for line in receipt.items.select_related('product'):
                post_stock(
                    company=receipt.company, product=line.product, warehouse=receipt.warehouse,
                    quantity=-line.quantity, movement_type='PURCHASE_IN',
                    note=f'Cancelled goods receipt {receipt.number}', user=request.user,
                )
                if line.order_item_id:
                    order_item = PurchaseOrderItem.objects.select_for_update().get(pk=line.order_item_id)
                    order_item.received_quantity -= line.quantity
                    order_item.save(update_fields=['received_quantity'])
            receipt.status = 'CANCELLED'
            receipt.save(update_fields=['status', 'updated_at'])
            if receipt.purchase_order:
                receipt.purchase_order.refresh_receipt_status()
        return Response(self.get_serializer(receipt).data)


class PurchaseBillViewSet(
    ScopedQuerysetMixin, mixins.CreateModelMixin, mixins.ListModelMixin,
    mixins.RetrieveModelMixin, viewsets.GenericViewSet,
):
    serializer_class = PurchaseBillSerializer
    queryset = PurchaseBill.objects.select_related('company', 'supplier').prefetch_related('items__product__unit')
    extra_filter_fields = ('supplier',)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        bill = self.get_object()
        if bill.status == 'CANCELLED':
            raise serializers.ValidationError(f'{bill.number} is already cancelled.')
        if bill.amount_paid > 0:
            raise serializers.ValidationError('This bill has payments recorded against it. Cancel those payments first.')

        with transaction.atomic():
            if bill.update_stock:
                for line in bill.items.select_related('product'):
                    post_stock(
                        company=bill.company, product=line.product, warehouse=bill.warehouse,
                        quantity=-line.quantity, movement_type='PURCHASE_IN',
                        note=f'Cancelled purchase bill {bill.number}', user=request.user,
                    )
            bill.status = 'CANCELLED'
            bill.updated_by = request.user
            bill.save(update_fields=['status', 'updated_by', 'updated_at'])
        return Response(self.get_serializer(bill).data)
