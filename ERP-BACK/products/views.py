from rest_framework import permissions, viewsets

from companies.permissions import get_visible_company_ids

from .models import Product
from .serializers import ProductSerializer


class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProductSerializer
    queryset = Product.objects.select_related(
        'company', 'brand', 'group', 'sub_group', 'category', 'sub_category', 'unit', 'gst_master'
    ).order_by('name')

    def get_queryset(self):
        company_ids = get_visible_company_ids(self.request.user)
        return self.queryset.filter(company_id__in=company_ids)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)