"""
Super Admin console API (in-app, not Django's /admin/).
Everything here requires user.is_super_admin and is mounted at /api/admin/.
"""
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from companies.models import Company

from .models import User
from .permissions import IsSuperAdmin
from .serializers import generate_temp_password, login_url_for, send_temp_password_email

BLOCKED_COMPANY_STATUSES = ('INACTIVE', 'REJECTED')


def end_sessions(user):
    """Blacklist every refresh token so the user is signed out everywhere."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def issue_temporary_password(user, password=None):
    """Set a temp password, force the OTP change on next login, email it. Returns (password, email_sent)."""
    password = password or generate_temp_password()
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=['password', 'must_change_password'])
    end_sessions(user)
    try:
        send_temp_password_email(user.email, password, user.company.name if user.company else None, login_url_for(user))
        return password, True
    except Exception:
        return password, False


class AdminSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        users = User.objects.filter(is_super_admin=False)
        return Response({
            'registered_companies': Company.objects.filter(company_type='MAIN', owner__isnull=True).count(),
            'companies': Company.objects.count(),
            'inactive_companies': Company.objects.filter(status__in=BLOCKED_COMPANY_STATUSES).count(),
            'users': users.count(),
            'active_users': users.filter(is_active=True).count(),
            'awaiting_password_change': users.filter(is_active=True, must_change_password=True).count(),
            'pending_approvals': users.filter(email_verified=True, approval_status='PENDING').count(),
        })


class AdminCompanyListView(APIView):
    """Every company with user counts and its first admin login, for the console's company tree."""
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        from companies.serializers import CompanySerializer
        from companies.views import _tree_key

        companies = sorted(
            Company.objects.select_related('owner', 'parent_company', 'parent_company__owner')
            .annotate(user_count=Count('users'), active_user_count=Count('users', filter=Q(users__is_active=True))),
            key=_tree_key,
        )
        first_admin = {}
        for u in User.objects.filter(company__isnull=False, is_super_admin=False).order_by('date_joined', 'id'):
            first_admin.setdefault(u.company_id, u)

        # Self-registrations waiting for approval are handled on the Pending tab, not by status toggles.
        awaiting = set(User.objects.filter(approval_status='PENDING', email_verified=True).values_list('company_id', flat=True))
        data = CompanySerializer(companies, many=True, context={'request': request}).data
        for row, company in zip(data, companies):
            admin = first_admin.get(company.id)
            row['user_count'] = company.user_count
            row['active_user_count'] = company.active_user_count
            row['awaiting_approval'] = company.id in awaiting
            row['admin_user'] = {
                'id': admin.id, 'email': admin.email, 'is_active': admin.is_active,
                'must_change_password': admin.must_change_password, 'last_login': admin.last_login,
            } if admin else None
        return Response(data)


class AdminUserSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)
    company_type = serializers.CharField(source='company.company_type', read_only=True, allow_null=True)
    group_name = serializers.SerializerMethodField()
    role_name = serializers.CharField(source='role.name', read_only=True, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name', 'designation',
            'company', 'company_name', 'company_type', 'group_name', 'role', 'role_name',
            'is_active', 'is_super_admin', 'approval_status', 'email_verified', 'must_change_password',
            'last_login', 'date_joined', 'password',
        ]
        read_only_fields = [
            'id', 'full_name', 'role', 'is_super_admin', 'approval_status', 'email_verified',
            'must_change_password', 'last_login', 'date_joined',
        ]

    def get_group_name(self, obj):
        return obj.company.registered_company.name if obj.company else None

    def validate_email(self, value):
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_password(self, value):
        if value:
            from django.contrib.auth import password_validation
            password_validation.validate_password(value)
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get('company'):
            raise serializers.ValidationError({'company': 'Choose the company this user belongs to.'})
        if self.instance is not None:
            request_user = self.context['request'].user
            if self.instance.pk == request_user.pk and attrs.get('is_active') is False:
                raise serializers.ValidationError({'is_active': 'You cannot deactivate your own account.'})
            if self.instance.is_super_admin and 'company' in attrs:
                raise serializers.ValidationError({'company': 'Super Admin accounts are not tied to a company.'})
        return attrs


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    GET    /api/admin/users/?company=&search=&status=active|inactive|password_change
    POST   /api/admin/users/                    create a company user (temp password, forced OTP change)
    PATCH  /api/admin/users/<id>/               edit name/company/active
    POST   /api/admin/users/<id>/reset-password/
    """
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]
    serializer_class = AdminUserSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = User.objects.select_related('company', 'company__owner', 'company__parent_company', 'role').order_by('email')
        params = self.request.query_params
        if params.get('company'):
            qs = qs.filter(company_id=params['company'])
        if params.get('search'):
            q = params['search']
            qs = qs.filter(Q(email__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
                           | Q(company__name__icontains=q))
        state = params.get('status')
        if state == 'active':
            qs = qs.filter(is_active=True)
        elif state == 'inactive':
            qs = qs.filter(is_active=False)
        elif state == 'password_change':
            qs = qs.filter(is_active=True, must_change_password=True)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        chosen = data.pop('password', '')
        data.pop('is_active', None)
        user = User.objects.create_user(
            **data, password=None, is_active=True, approval_status='APPROVED', email_verified=False,
        )
        password, email_sent = issue_temporary_password(user, chosen)
        return Response(
            {'user': self.get_serializer(user).data,
             'credentials': {'username': user.email, 'password': password, 'login_url': login_url_for(user)},
             'email_sent': email_sent},
            status=status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        user = serializer.save()
        if not user.is_active:
            end_sessions(user)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        user = self.get_object()
        if user.is_super_admin:
            raise serializers.ValidationError('Super Admin passwords cannot be reset from the console.')
        password, email_sent = issue_temporary_password(user)
        return Response({
            'credentials': {'username': user.email, 'password': password, 'login_url': login_url_for(user)},
            'email_sent': email_sent,
        })


class AdminCompanyStatusView(APIView):
    """POST /api/admin/companies/<id>/status/ {"status": "ACTIVE"|"INACTIVE"} — inactive blocks the company's logins."""
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]

    def post(self, request, pk):
        company = get_object_or_404(Company, pk=pk)
        new_status = request.data.get('status')
        if new_status not in ('ACTIVE', 'INACTIVE'):
            raise serializers.ValidationError({'status': 'Use ACTIVE or INACTIVE.'})
        if User.objects.filter(company=company, approval_status='PENDING', email_verified=True).exists():
            raise serializers.ValidationError('This company is awaiting approval. Approve or reject its registration instead.')
        company.status = new_status
        company.updated_by = request.user
        company.save(update_fields=['status', 'updated_by', 'updated_at'])
        if new_status == 'INACTIVE':
            affected = [company]
            if company.is_registered_company:
                affected = list(company.group_queryset())
            for user in User.objects.filter(company__in=affected):
                end_sessions(user)
        return Response({'id': company.id, 'status': company.status})
