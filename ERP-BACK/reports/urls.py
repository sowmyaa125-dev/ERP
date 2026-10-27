from django.urls import path

from .views import DashboardView, GSTReportView, PurchaseReportView, SalesReportView, StockReportView

urlpatterns = [
    path('reports/dashboard/', DashboardView.as_view(), name='report_dashboard'),
    path('reports/sales/', SalesReportView.as_view(), name='report_sales'),
    path('reports/purchases/', PurchaseReportView.as_view(), name='report_purchases'),
    path('reports/gst/', GSTReportView.as_view(), name='report_gst'),
    path('reports/stock/', StockReportView.as_view(), name='report_stock'),
]
