from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import User

from .serializers import (
    ChangePasswordSerializer,
    EmailTokenObtainPairSerializer,
    UserSerializer,
)


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class RequestPasswordChangeOTPView(APIView):
    """Email a 6-digit code that authorises setting a new password."""
    permission_classes = [permissions.IsAuthenticated]
    RESEND_AFTER_SECONDS = 60

    def post(self, request):
        from datetime import timedelta

        from django.utils import timezone

        from .models import RegistrationOTP
        from .serializers import mask_email, send_password_change_otp_email

        user = request.user
        pending = user.otps.filter(purpose='PASSWORD_CHANGE', is_used=False)
        latest = pending.order_by('-created_at').first()
        if latest and timezone.now() - latest.created_at < timedelta(seconds=self.RESEND_AFTER_SECONDS):
            wait = self.RESEND_AFTER_SECONDS - int((timezone.now() - latest.created_at).total_seconds())
            return Response(
                {'detail': f'Please wait {wait} seconds before requesting another code.', 'resend_after': wait},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        pending.update(is_used=True)  # only the newest code is ever valid
        otp = RegistrationOTP.objects.create(
            user=user, purpose='PASSWORD_CHANGE', code=RegistrationOTP.generate_code()
        )
        try:
            send_password_change_otp_email(user.email, otp.code)
        except Exception:
            otp.delete()
            return Response(
                {'detail': 'Could not send the verification email. Please contact your administrator.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            'detail': f'A verification code was sent to {mask_email(user.email)}.',
            'email': mask_email(user.email),
            'expires_in': 600,
            'resend_after': self.RESEND_AFTER_SECONDS,
        })


class ConfirmPasswordChangeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .serializers import ConfirmPasswordChangeSerializer

        serializer = ConfirmPasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({'detail': 'Password updated.', 'user': UserSerializer(user).data})


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Password updated.'})

from rest_framework import status
from .serializers import MainCompanyRegistrationSerializer, VerifyOTPSerializer


class RegisterMainCompanyView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = MainCompanyRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(
            {'detail': 'Registered. Check your email for the verification code.',
             'email': result['user'].email},
            status=status.HTTP_201_CREATED,
        )


class VerifyOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Email verified. Awaiting Super Admin approval.'})
from rest_framework import generics
from .permissions import IsSuperAdmin
from .serializers import PendingRegistrationSerializer


class PendingRegistrationsView(generics.ListAPIView):
    """Super Admin inbox: registrations that verified email but aren't approved yet."""
    serializer_class = PendingRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]

    def get_queryset(self):
        return User.objects.filter(
            email_verified=True, approval_status='PENDING'
        ).select_related('company').order_by('date_joined')


class ApproveRegistrationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]

    def post(self, request, user_id):
        user = generics.get_object_or_404(User, id=user_id)

        if not user.email_verified:
            return Response({'detail': 'Cannot approve — email not verified yet.'}, status=400)

        user.approval_status = 'APPROVED'
        user.is_active = True
        user.save(update_fields=['approval_status', 'is_active'])

        if user.company:
            user.company.status = 'ACTIVE'
            user.company.save(update_fields=['status'])

        _notify(user, 'Your ERP registration has been approved',
                'Your company registration has been approved. You can now sign in with the email '
                'and password you registered with.')
        return Response({'detail': f'{user.email} approved and activated.'})


class RejectRegistrationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]

    def post(self, request, user_id):
        user = generics.get_object_or_404(User, id=user_id)
        user.approval_status = 'REJECTED'
        user.is_active = False
        user.save(update_fields=['approval_status', 'is_active'])

        if user.company:
            user.company.status = 'REJECTED'
            user.company.save(update_fields=['status'])

        reason = (request.data.get('reason') or '').strip()
        _notify(user, 'Your ERP registration was not approved',
                'Your company registration was not approved.' + (f'\n\nReason: {reason}' if reason else ''))
        return Response({'detail': f'{user.email} rejected.'})


def _notify(user, subject, message):
    from django.core.mail import send_mail

    send_mail(subject=subject, message=message, from_email=None, recipient_list=[user.email], fail_silently=True)