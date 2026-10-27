from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from companies.permissions import get_visible_company_ids

from .models import Stock, StockMovement
from .serializers import (
    OpeningStockSerializer,
    StockAdjustmentSerializer,
    StockMovementSerializer,
    StockSerializer,
    StockTransferSerializer,
)


class StockViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StockSerializer
    queryset = Stock.objects.select_related('product', 'warehouse').order_by('product__name')

    def get_queryset(self):
        company_ids = get_visible_company_ids(self.request.user)
        return self.queryset.filter(company_id__in=company_ids)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StockMovementSerializer
    queryset = StockMovement.objects.select_related('product', 'warehouse').order_by('-created_at')

    def get_queryset(self):
        company_ids = get_visible_company_ids(self.request.user)
        return self.queryset.filter(company_id__in=company_ids)


class OpeningStockView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = OpeningStockSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        movement = serializer.save()
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)


class StockAdjustmentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        movement = serializer.save()
        return Response(StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED)


class StockTransferView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = StockTransferSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(
            {
                'detail': 'Transfer completed.',
                'transfer_group': result['transfer_group'],
                'out_movement': StockMovementSerializer(result['out']).data,
                'in_movement': StockMovementSerializer(result['in']).data,
            },
            status=status.HTTP_201_CREATED,
        )