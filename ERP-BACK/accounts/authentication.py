from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


class PasswordChangeRequired(exceptions.PermissionDenied):
    default_detail = 'You must set a new password before continuing.'
    default_code = 'password_change_required'


BLOCKED_COMPANY_STATUSES = ('INACTIVE', 'REJECTED')


def company_blocked(user):
    """True when the user's company, or its registered company, has been deactivated by the Super Admin."""
    company = getattr(user, 'company', None)
    if company is None or user.is_super_admin:
        return False
    return company.status in BLOCKED_COMPANY_STATUSES or company.registered_company.status in BLOCKED_COMPANY_STATUSES


class CompanyInactive(exceptions.AuthenticationFailed):
    default_detail = 'Your company account is inactive. Please contact the administrator.'
    default_code = 'company_inactive'


class ERPJWTAuthentication(JWTAuthentication):
    """
    JWT auth that locks accounts flagged must_change_password (new company
    admins with a temporary password) out of everything except the
    endpoints needed to finish the OTP password change. Enforced here so it
    applies to every API view, whatever permission classes it declares.
    """

    ALLOWED_PATH_SUFFIXES = (
        '/auth/me/',
        '/auth/password-change/request-otp/',
        '/auth/password-change/confirm/',
        '/auth/logout/',
        '/auth/token/refresh/',
    )

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            user, _ = result
            if company_blocked(user):
                raise CompanyInactive()
            if user.must_change_password and not request.path.endswith(self.ALLOWED_PATH_SUFFIXES):
                # Body: {"detail": "...", "code": "password_change_required"} so the
                # frontend can redirect to the change-password screen.
                raise PasswordChangeRequired({
                    'detail': PasswordChangeRequired.default_detail,
                    'code': PasswordChangeRequired.default_code,
                })
        return result
