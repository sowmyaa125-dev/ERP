from rest_framework import serializers

from .models import Branch, Company, Department


class CompanySerializer(serializers.ModelSerializer):
    """
    Who can create what:
      Super Admin         -> a registered company (use /companies/register/ to also issue a login),
                             or a Sub under any Main company
      Registered company  -> Main companies in its group, and Sub companies under any Main in its group
      Other Main company  -> Sub companies under itself only
      Sub company         -> nothing
    """
    parent_company_name = serializers.CharField(source='parent_company.name', read_only=True, allow_null=True)
    owner_name = serializers.CharField(source='owner.name', read_only=True, allow_null=True)
    level = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    # Super Admin only: the registered company a new Main company joins (blank = a new registered company).
    group = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.filter(company_type='MAIN', owner__isnull=True),
        write_only=True, required=False, allow_null=True,
    )
    # Every new company gets its own admin login (temporary password, OTP change at first sign-in).
    admin_email = serializers.EmailField(write_only=True, required=False, help_text='Login username for the company admin')
    admin_first_name = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=150)
    admin_last_name = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=150)
    admin_password = serializers.CharField(write_only=True, required=False, allow_blank=True,
                                           help_text='Leave blank to generate a temporary password.')

    class Meta:
        model = Company
        fields = [
            'id', 'name', 'display_name', 'legal_name', 'company_type', 'level',
            'parent_company', 'parent_company_name', 'owner', 'owner_name',
            'email', 'phone', 'address', 'location', 'state', 'district',
            'pin_code', 'gst_number', 'status', 'created_at', 'updated_at', 'group',
            'admin_email', 'admin_first_name', 'admin_last_name', 'admin_password',
        ]
        read_only_fields = ['id', 'owner', 'created_at', 'updated_at']

    def get_level(self, obj):
        from .permissions import company_level
        return company_level(obj)

    def get_display_name(self, obj):
        # Shown in every company dropdown so Main vs Sub is obvious.
        if obj.company_type == 'SUB' and obj.parent_company_id:
            return f'{obj.name} (Sub of {obj.parent_company.name})'
        if obj.owner_id:
            return f'{obj.name} (Main)'
        return obj.name

    def validate(self, attrs):
        user = self.context['request'].user
        group = attrs.pop('group', None)  # not a model field; only used below on create
        admin = {k: attrs.pop(k, '') for k in ('admin_email', 'admin_first_name', 'admin_last_name', 'admin_password')}
        if self.instance is None:
            self._admin = self._validate_admin(admin)

        if self.instance is not None:
            # Structure is fixed after creation; only details/status are editable.
            for field in ('company_type', 'parent_company'):
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError({field: 'This cannot be changed after the company is created.'})
            return attrs

        company_type = attrs.get('company_type')
        parent = attrs.get('parent_company')
        own = user.company

        if user.is_super_admin:
            attrs.setdefault('status', 'ACTIVE')
            if company_type == 'MAIN':
                attrs['parent_company'] = None
                attrs['owner'] = group  # None -> a new registered company
            else:
                if not parent or parent.company_type != 'MAIN':
                    raise serializers.ValidationError({'parent_company': 'Choose the Main company this Sub company belongs to.'})
                attrs['owner'] = parent.registered_company
            return attrs

        if own is None or own.company_type == 'SUB':
            raise serializers.ValidationError('Your account is not allowed to create companies.')

        root = own.registered_company
        if company_type == 'MAIN':
            if not own.is_registered_company:
                raise serializers.ValidationError(
                    {'company_type': 'Only the registered company can add Main companies.'}
                )
            attrs['parent_company'] = None
        else:
            if own.is_registered_company:
                group_ids = set(own.group_queryset().filter(company_type='MAIN').values_list('id', flat=True))
                if not parent:
                    parent = own
                if parent.id not in group_ids or parent.company_type != 'MAIN':
                    raise serializers.ValidationError(
                        {'parent_company': 'Choose a Main company from your group.'}
                    )
            else:
                if parent and parent.id != own.id:
                    raise serializers.ValidationError(
                        {'parent_company': 'You can only add Sub companies under your own company.'}
                    )
                parent = own
            attrs['parent_company'] = parent

        attrs['owner'] = root
        # Companies a company adds itself are live immediately — no Super Admin approval.
        attrs['status'] = 'ACTIVE'
        return attrs


    @staticmethod
    def _validate_admin(admin):
        from accounts.models import User

        if not admin['admin_email']:
            raise serializers.ValidationError({'admin_email': "Enter the login email for this company's admin."})
        if User.objects.filter(email__iexact=admin['admin_email']).exists():
            raise serializers.ValidationError({'admin_email': 'An account with this email already exists.'})
        if admin['admin_password']:
            from django.contrib.auth import password_validation
            try:
                password_validation.validate_password(admin['admin_password'])
            except Exception as exc:  # DjangoValidationError -> field error
                raise serializers.ValidationError({'admin_password': list(getattr(exc, 'messages', [str(exc)]))})
        return admin

    def create(self, validated_data):
        """Create the company and its admin login, then email the credentials."""
        from django.db import transaction

        from accounts.models import User
        from accounts.serializers import generate_temp_password, login_url_for, send_temp_password_email

        admin = self._admin
        password = admin['admin_password'] or generate_temp_password()
        with transaction.atomic():
            company = super().create(validated_data)
            user = User.objects.create_user(
                email=admin['admin_email'], password=password, company=company,
                first_name=admin['admin_first_name'], last_name=admin['admin_last_name'],
                is_active=True, approval_status='APPROVED',
                email_verified=False,       # confirmed by the OTP at first sign-in
                must_change_password=True,
            )
        login_url = login_url_for(user)
        try:
            send_temp_password_email(user.email, password, company.name, login_url)
            self.email_sent = True
        except Exception:  # mail problems must not undo the company
            self.email_sent = False
        self.credentials = {'username': user.email, 'password': password, 'login_url': login_url}
        return company


class RegisterCompanySerializer(serializers.Serializer):
    """
    Super Admin registers a new top-level company and its admin login.
    The admin gets the username (email) + password by mail and must change
    the password, with an OTP sent to that email, on first login.
    """
    name = serializers.CharField(max_length=200)
    legal_name = serializers.CharField(max_length=250, required=False, allow_blank=True)
    email = serializers.EmailField(help_text='Company email')
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    district = serializers.CharField(max_length=100, required=False, allow_blank=True)
    pin_code = serializers.CharField(max_length=10, required=False, allow_blank=True)
    gst_number = serializers.CharField(max_length=30, required=False, allow_blank=True)

    admin_email = serializers.EmailField(help_text='Login username for the company admin')
    admin_first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    admin_last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    admin_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True,
        help_text='Leave blank to generate a temporary password.',
    )

    def validate_admin_email(self, value):
        from accounts.models import User
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_admin_password(self, value):
        if value:
            from django.contrib.auth import password_validation
            password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        from django.db import transaction

        from accounts.models import User
        from accounts.serializers import generate_temp_password, login_url_for, send_temp_password_email

        creator = self.context['request'].user
        password = validated_data.pop('admin_password', '') or generate_temp_password()
        admin = {k: validated_data.pop(k, '') for k in ('admin_email', 'admin_first_name', 'admin_last_name')}

        with transaction.atomic():
            company = Company.objects.create(
                **validated_data, company_type='MAIN', status='ACTIVE',
                created_by=creator, updated_by=creator,
            )
            user = User.objects.create_user(
                email=admin['admin_email'], password=password, company=company,
                first_name=admin['admin_first_name'], last_name=admin['admin_last_name'],
                is_active=True, approval_status='APPROVED',
                email_verified=False,         # confirmed by the OTP at first login
                must_change_password=True,
            )

        try:
            send_temp_password_email(user.email, password, company.name, login_url_for(user))
            email_sent = True
        except Exception:  # SMTP problems must not undo the registration
            email_sent = False

        return {'company': company, 'user': user, 'password': password, 'email_sent': email_sent}


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = [
            'id', 'company', 'branch_code', 'name', 'address', 'location',
            'state', 'district', 'pin_code', 'phone', 'email', 'gst_number',
            'branch_manager', 'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_company(self, company):
        from .permissions import get_visible_company_ids
        request = self.context['request']
        if company.id not in get_visible_company_ids(request.user):
            raise serializers.ValidationError('You do not have access to this company.')
        return company


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = [
            'id', 'company', 'branch', 'code', 'name', 'description',
            'department_head', 'status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_company(self, company):
        from .permissions import get_visible_company_ids
        request = self.context['request']
        if company.id not in get_visible_company_ids(request.user):
            raise serializers.ValidationError('You do not have access to this company.')
        return company

    def validate(self, attrs):
        company = attrs.get('company') or getattr(self.instance, 'company', None)
        branch = attrs.get('branch') or getattr(self.instance, 'branch', None)
        if branch and company and branch.company_id != company.id:
            raise serializers.ValidationError(
                {'branch': 'Branch must belong to the same company as the department.'}
            )
        return attrs


class SubCompanyCreateSerializer(serializers.Serializer):
    """
    Main Company creates a Sub-Company + its first user account.
    Issues a temp password by email; that user must change it on first login.
    """
    company_name = serializers.CharField(max_length=200)
    admin_email = serializers.EmailField()
    admin_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_admin_email(self, value):
        from accounts.models import User
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def create(self, validated_data):
        from accounts.models import User
        from accounts.serializers import generate_temp_password, send_temp_password_email

        main_company = self.context['request'].user.company

        sub_company = Company.objects.create(
            name=validated_data['company_name'],
            company_type='SUB',
            parent_company=main_company,
            owner=main_company.registered_company,
            email=validated_data['admin_email'],
            phone=validated_data.get('admin_phone', ''),
            status='ACTIVE',
            created_by=self.context['request'].user,
        )

        temp_password = generate_temp_password()
        admin_user = User.objects.create_user(
            email=validated_data['admin_email'],
            password=temp_password,
            company=sub_company,
            is_active=True,
            approval_status='APPROVED',
            email_verified=True,
            must_change_password=True,
        )

        from accounts.serializers import login_url_for
        send_temp_password_email(admin_user.email, temp_password, sub_company.name, login_url_for(admin_user))

        return {'company': sub_company, 'user': admin_user}