from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BranchViewSet, CompanyViewSet, CreateSubCompanyView, DepartmentViewSet, RegisterCompanyView

router = DefaultRouter()
router.register('companies', CompanyViewSet, basename='company')
router.register('branches', BranchViewSet, basename='branch')
router.register('departments', DepartmentViewSet, basename='department')

urlpatterns = [
    # Before the router so 'register' is not read as a company id.
    path('companies/register/', RegisterCompanyView.as_view(), name='register_company'),
] + router.urls + [
    path('sub-companies/create/', CreateSubCompanyView.as_view(), name='create_sub_company'),
]