from django.urls import path
from rest_framework.routers import DefaultRouter

from .admin_console import AdminCompanyListView, AdminCompanyStatusView, AdminSummaryView, AdminUserViewSet

router = DefaultRouter()
router.register('users', AdminUserViewSet, basename='admin-user')

urlpatterns = [
    path('summary/', AdminSummaryView.as_view(), name='admin_summary'),
    path('companies/', AdminCompanyListView.as_view(), name='admin_companies'),
    path('companies/<int:pk>/status/', AdminCompanyStatusView.as_view(), name='admin_company_status'),
] + router.urls
