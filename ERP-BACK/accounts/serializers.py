from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User

from django.core.mail import send_mail
from django.conf import settings as django_settings


def send_otp_email(to_email, code):
    send_mail(
        subject='Your ERP registration verification code',
        message=f'Your verification code is: {code}\nIt expires in 10 minutes.',
        from_email=None,
        recipient_list=[to_email],
        fail_silently=False,
    )


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'company', 'company_name', 'company_type', 'branch', 'department', 'designation',
            'is_super_admin', 'must_change_password', 'company_level', 'date_joined',
        ]
        read_only_fields = fields

    company_name = serializers.CharField(source='company.name', read_only=True, allow_null=True)
    company_type = serializers.CharField(source='company.company_type', read_only=True, allow_null=True)
    # REGISTERED / MAIN / SUB — decides which companies this user may create.
    company_level = serializers.SerializerMethodField()

    def get_company_level(self, obj):
        from companies.permissions import company_level
        return company_level(obj.company)


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        from .authentication import CompanyInactive, company_blocked

        data = super().validate(attrs)
        if company_blocked(self.user):
            raise CompanyInactive()
        data['user'] = UserSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Old password is incorrect.')
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password'])
        return user


from django.contrib.auth import password_validation as _pv  # already imported above, safe if duplicated
from .models import RegistrationOTP


class MainCompanyRegistrationSerializer(serializers.Serializer):
    """
    Public self-registration for a Main Company. Creates:
      - a PENDING/INACTIVE Company (company_type=MAIN)
      - a PENDING/INACTIVE User (the registrant, email_verified=False)
      - a RegistrationOTP emailed to the registrant

    Nothing here trusts client-provided status/approval fields — those
    are always set server-side, never accepted as input.
    """
    company_name = serializers.CharField(max_length=200)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        from .models import User
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        from companies.models import Company
        from .models import User

        company = Company.objects.create(
            name=validated_data['company_name'],
            company_type='MAIN',
            email=validated_data['email'],
            phone=validated_data.get('phone', ''),
            status='PENDING',
        )
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            company=company,
            is_active=False,       # cannot log in until Super Admin approves
            is_staff=False,
            must_change_password=False,  # they set their own password at registration
        )

        otp = RegistrationOTP.objects.create(user=user, code=RegistrationOTP.generate_code())
        send_otp_email(user.email, otp.code)

        return {'user': user, 'company': company}


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        from .models import User
        try:
            user = User.objects.get(email__iexact=attrs['email'])
        except User.DoesNotExist:
            raise serializers.ValidationError('Invalid email or code.')

        otp = user.otps.filter(purpose='REGISTRATION', code=attrs['code']).order_by('-created_at').first()
        if not otp or not otp.is_valid():
            raise serializers.ValidationError('Invalid or expired code.')

        attrs['user'] = user
        attrs['otp'] = otp
        return attrs

    def save(self, **kwargs):
        user = self.validated_data['user']
        otp = self.validated_data['otp']
        otp.is_used = True
        otp.save(update_fields=['is_used'])
        user.email_verified = True
        user.save(update_fields=['email_verified'])
        return user

class PendingRegistrationSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)
    company_status = serializers.CharField(source='company.status', read_only=True)
    company_phone = serializers.CharField(source='company.phone', read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'company', 'company_name', 'company_status', 'company_phone',
            'email_verified', 'approval_status', 'date_joined',
        ]
        read_only_fields = fields

import secrets
import string


def generate_temp_password(length=12):
    alphabet = string.ascii_letters + string.digits + '!@#$%'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def login_url_for(user):
    """Sign-in page for this account: the admin portal for Super Admins, the company ERP for everyone else."""
    urls = django_settings.FRONTEND_LOGIN_URLS
    return urls['admin'] if user.is_super_admin else urls['company']


def send_temp_password_email(to_email, temp_password, company_name=None, login_url=None):
    sign_in = f'Sign in at: {login_url}\n' if login_url else ''
    send_mail(
        subject='Your ERP account credentials',
        message=(
            f'An ERP account has been created for you'
            f'{f" for {company_name}" if company_name else ""}.\n\n'
            f'{sign_in}'
            f'Username: {to_email}\n'
            f'Temporary password: {temp_password}\n\n'
            f'When you first sign in you must set a new password. A verification '
            f'code will be sent to this email address to confirm the change.'
        ),
        from_email=None,
        recipient_list=[to_email],
        fail_silently=False,
    )


def send_password_change_otp_email(to_email, code):
    send_mail(
        subject='Your ERP password change code',
        message=(
            f'Your verification code to set a new password is: {code}\n'
            f'It expires in 10 minutes. If you did not try to sign in, contact your administrator.'
        ),
        from_email=None,
        recipient_list=[to_email],
        fail_silently=False,
    )


def mask_email(email):
    name, _, domain = email.partition('@')
    return f'{name[:2]}{"*" * max(len(name) - 2, 1)}@{domain}'


class ConfirmPasswordChangeSerializer(serializers.Serializer):
    """Set a new password using the emailed PASSWORD_CHANGE code."""
    code = serializers.CharField(max_length=6)
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = self.context['request'].user
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})

        otp = user.otps.filter(purpose='PASSWORD_CHANGE', is_used=False).order_by('-created_at').first()
        if not otp or not otp.is_valid():
            raise serializers.ValidationError({'code': 'This code has expired or was tried too many times. Request a new code.'})
        if otp.code != attrs['code'].strip():
            otp.attempts += 1
            otp.save(update_fields=['attempts'])
            left = RegistrationOTP.MAX_ATTEMPTS - otp.attempts
            raise serializers.ValidationError(
                {'code': f'Incorrect code. {left} attempt{"s" if left != 1 else ""} left.' if left > 0
                 else 'Incorrect code. Request a new code.'}
            )

        if user.check_password(attrs['new_password']):
            raise serializers.ValidationError({'new_password': 'Choose a password different from your temporary one.'})
        password_validation.validate_password(attrs['new_password'], user)
        attrs['otp'] = otp
        return attrs

    def save(self, **kwargs):
        user = self.context['request'].user
        otp = self.validated_data['otp']
        otp.is_used = True
        otp.save(update_fields=['is_used'])
        user.set_password(self.validated_data['new_password'])
        user.must_change_password = False
        user.email_verified = True  # the code proved they control this mailbox
        user.save(update_fields=['password', 'must_change_password', 'email_verified'])
        return user
