from rest_framework.routers import DefaultRouter

from .views import QuotationViewSet, SalesInvoiceViewSet, SalesOrderViewSet

router = DefaultRouter()
router.register('quotations', QuotationViewSet, basename='quotation')
router.register('sales-orders', SalesOrderViewSet, basename='sales-order')
router.register('sales-invoices', SalesInvoiceViewSet, basename='sales-invoice')

urlpatterns = router.urls
