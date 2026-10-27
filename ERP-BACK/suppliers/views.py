from rest_framework import permissions, viewsets

from companies.permissions import get_visible_branch_ids, get_visible_company_ids

from .models import Supplier
from .serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SupplierSerializer
    queryset = Supplier.objects.select_related('company', 'branch').order_by('name')

    def get_queryset(self):
        user = self.request.user
        company_ids = get_visible_company_ids(user)
        qs = self.queryset.filter(company_id__in=company_ids)

        branch_ids = get_visible_branch_ids(user)
        if branch_ids is not None:
            qs = qs.filter(branch_id__in=branch_ids)

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)