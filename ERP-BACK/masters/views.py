from rest_framework import permissions, viewsets

from companies.permissions import get_visible_company_ids

from .models import Brand, Category, GSTMaster, Group, SubCategory, SubGroup, UnitMaster, Warehouse
from .serializers import (
    BrandSerializer, CategorySerializer, GSTMasterSerializer, GroupSerializer,
    SubCategorySerializer, SubGroupSerializer, UnitMasterSerializer, WarehouseSerializer,
)


class ScopedMasterViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    company_field = 'company_id'

    def get_queryset(self):
        company_ids = get_visible_company_ids(self.request.user)
        return self.queryset.filter(**{f'{self.company_field}__in': company_ids})

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()


class GroupViewSet(ScopedMasterViewSet):
    queryset = Group.objects.all().order_by('name')
    serializer_class = GroupSerializer


class SubGroupViewSet(ScopedMasterViewSet):
    queryset = SubGroup.objects.select_related('group').order_by('name')
    serializer_class = SubGroupSerializer


class CategoryViewSet(ScopedMasterViewSet):
    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer


class SubCategoryViewSet(ScopedMasterViewSet):
    queryset = SubCategory.objects.select_related('category').order_by('name')
    serializer_class = SubCategorySerializer


class BrandViewSet(ScopedMasterViewSet):
    queryset = Brand.objects.all().order_by('name')
    serializer_class = BrandSerializer


class GSTMasterViewSet(ScopedMasterViewSet):
    queryset = GSTMaster.objects.all().order_by('name')
    serializer_class = GSTMasterSerializer


class UnitMasterViewSet(ScopedMasterViewSet):
    queryset = UnitMaster.objects.all().order_by('name')
    serializer_class = UnitMasterSerializer


class WarehouseViewSet(ScopedMasterViewSet):
    queryset = Warehouse.objects.select_related('company', 'branch').order_by('name')
    serializer_class = WarehouseSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)