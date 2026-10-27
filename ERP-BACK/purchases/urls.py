from rest_framework.routers import DefaultRouter

from .views import GoodsReceiptViewSet, PurchaseBillViewSet, PurchaseOrderViewSet

router = DefaultRouter()
router.register('purchase-orders', PurchaseOrderViewSet, basename='purchase-order')
router.register('goods-receipts', GoodsReceiptViewSet, basename='goods-receipt')
router.register('purchase-bills', PurchaseBillViewSet, basename='purchase-bill')

urlpatterns = router.urls
