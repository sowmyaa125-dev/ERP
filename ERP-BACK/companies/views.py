from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin
from accounts.serializers import login_url_for

from .models import Branch, Company, Department
from .permissions import IsMainCompanyUser, get_visible_branch_ids, get_visible_company_ids
from .serializers import (
    BranchSerializer,
    CompanySerializer,
    DepartmentSerializer,
    RegisterCompanySerializer,
    SubCompanyCreateSerializer,
)


class ScopedViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    company_field = 'company_id'
    branch_field = None  # set to 'branch_id' or 'id' on subclasses that support branch scoping

    def get_queryset(self):
        user = self.request.user
        company_ids = get_visible_company_ids(user)
        qs = self.queryset.filter(**{f'{self.company_field}__in': company_ids})

        if self.branch_field:
            branch_ids = get_visible_branch_ids(user)
            if branch_ids is not None:
                qs = qs.filter(**{f'{self.branch_field}__in': branch_ids})

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


def _tree_key(company):
    """Sort so each registered company is followed by its Main companies, each followed by its Subs."""
    root = company.registered_company
    if company.company_type == 'SUB' and company.parent_company_id:
        main = company.parent_company
        return (root.name.lower(), root.id, main.id != root.id, main.name.lower(), main.id, 1, company.name.lower())
    return (root.name.lower(), root.id, company.id != root.id, company.name.lower(), company.id, 0, '')


class CompanyViewSet(ScopedViewSet):
    queryset = Company.objects.select_related('owner', 'parent_company', 'parent_company__owner').order_by('name')
    serializer_class = CompanySerializer
    company_field = 'id'

    def list(self, request, *args, **kwargs):
        companies = sorted(self.filter_queryset(self.get_queryset()), key=_tree_key)
        return Response(self.get_serializer(companies, many=True).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # The admin login is shown once so it can be handed over (it is also emailed).
        return Response(
            {**serializer.data, 'credentials': serializer.credentials, 'email_sent': serializer.email_sent},
            status=status.HTTP_201_CREATED,
        )


class RegisterCompanyView(APIView):
    """Super Admin: create a registered company plus its admin login."""
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]

    def post(self, request):
        serializer = RegisterCompanySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(
            {
                'company': CompanySerializer(result['company'], context={'request': request}).data,
                # Returned once so the Super Admin can hand the credentials over.
                'credentials': {
                    'username': result['user'].email, 'password': result['password'],
                    'login_url': login_url_for(result['user']),
                },
                'email_sent': result['email_sent'],
            },
            status=status.HTTP_201_CREATED,
        )


class BranchViewSet(ScopedViewSet):
    queryset = Branch.objects.select_related('company').order_by('name')
    serializer_class = BranchSerializer
    branch_field = 'id'


class DepartmentViewSet(ScopedViewSet):
    queryset = Department.objects.select_related('company', 'branch').order_by('name')
    serializer_class = DepartmentSerializer
    branch_field = 'branch_id'


class CreateSubCompanyView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsMainCompanyUser]

    def post(self, request):
        serializer = SubCompanyCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(
            {
                'detail': f"Sub-Company '{result['company'].name}' created. "
                          f"Temp password emailed to {result['user'].email}.",
                'company_id': result['company'].id,
                'user_id': result['user'].id,
            },
            status=status.HTTP_201_CREATED,
        )
