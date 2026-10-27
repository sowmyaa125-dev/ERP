from rest_framework.permissions import BasePermission

from .models import Company


def company_level(company):
    """'REGISTERED', 'MAIN' or 'SUB' — what this company may create under it."""
    if company is None:
        return None
    if company.is_registered_company:
        return 'REGISTERED'
    return company.company_type


class IsMainCompanyUser(BasePermission):
    """Only users attached to a MAIN company may create Sub-Companies."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.company_id
            and user.company.company_type == 'MAIN'
        )

def get_visible_company_ids(user):
    """
    Which company IDs this user's role allows them to see.
    Falls back to "own company only" if no role/scope is set yet,
    which is the safest default.
    """
    if user.is_super_admin:
        return list(Company.objects.values_list('id', flat=True))

    company = user.company
    if not company:
        return []

    role = user.role
    # Registered (top-level) company: the whole group — its Main companies
    # and every Sub company under any of them.
    if company.is_registered_company and (not role or role.scope == 'COMPANY_WIDE'):
        return list(company.group_queryset().values_list('id', flat=True))

    if not role:
        if company.company_type == 'MAIN':
            sub_ids = company.sub_companies.values_list('id', flat=True)
            return [company.id, *sub_ids]
        return [company.id]

    if role.scope == 'SELECTED_SUB_COMPANIES' and company.company_type == 'MAIN':
        sub_ids = list(role.scoped_sub_companies.values_list('id', flat=True))
        return [company.id] + sub_ids

    if role.scope == 'COMPANY_WIDE' and company.company_type == 'MAIN':
        sub_ids = company.sub_companies.values_list('id', flat=True)
        return [company.id, *sub_ids]

    # SELECTED_BRANCHES, OWN_BRANCH, or a SUB company user stay scoped to
    # their own company. Branch-level narrowing is applied separately.
    return [company.id]


def get_visible_branch_ids(user):
    """
    Which branch IDs this user's role allows them to see, within
    whatever companies get_visible_company_ids already returned.
    Returns None to mean "no branch-level restriction" (i.e. all
    branches within the visible companies).
    """
    role = user.role
    if not role or role.scope == 'COMPANY_WIDE' or role.scope == 'SELECTED_SUB_COMPANIES':
        return None  # no branch narrowing

    if role.scope == 'OWN_BRANCH':
        return [user.branch_id] if user.branch_id else []

    if role.scope == 'SELECTED_BRANCHES':
        return list(role.scoped_branches.values_list('id', flat=True))

    return None