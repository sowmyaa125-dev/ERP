from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    OpeningStockView, StockAdjustmentView, StockMovementViewSet,
    StockTransferView, StockViewSet,
)

router = DefaultRouter()
router.register('stock-balances', StockViewSet, basename='stock-balance')
router.register('stock-movements', StockMovementViewSet, basename='stock-movement')

urlpatterns = router.urls + [
    path('stock/opening/', OpeningStockView.as_view(), name='opening_stock'),
    path('stock/adjustment/', StockAdjustmentView.as_view(), name='stock_adjustment'),
    path('stock/transfer/', StockTransferView.as_view(), name='stock_transfer'),
]