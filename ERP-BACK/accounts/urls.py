from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView

from .views import ChangePasswordView, EmailTokenObtainPairView, MeView
from .views import ConfirmPasswordChangeView, RequestPasswordChangeOTPView
from .views import RegisterMainCompanyView, VerifyOTPView 
from .views import ApproveRegistrationView, PendingRegistrationsView, RejectRegistrationView

urlpatterns = [
    path('login/', EmailTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', TokenBlacklistView.as_view(), name='token_blacklist'),
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('password-change/request-otp/', RequestPasswordChangeOTPView.as_view(), name='password_change_request_otp'),
    path('password-change/confirm/', ConfirmPasswordChangeView.as_view(), name='password_change_confirm'),
    path('register/', RegisterMainCompanyView.as_view(), name='register'),
    path('verify-otp/', VerifyOTPView.as_view(), name='verify_otp'),
    path('pending-registrations/', PendingRegistrationsView.as_view(), name='pending_registrations'),
    path('approve/<int:user_id>/', ApproveRegistrationView.as_view(), name='approve_registration'),
    path('reject/<int:user_id>/', RejectRegistrationView.as_view(), name='reject_registration'),
]