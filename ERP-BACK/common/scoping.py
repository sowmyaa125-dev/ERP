from rest_framework import permissions, serializers

from companies.permissions import get_visible_branch_ids, get_visible_company_ids


class ScopedQuerysetMixin:
    """
    Restricts a viewset to the companies/branches the user's role can see,
    and supports the common list filters:
    ?company= ?branch= ?status= ?date_from= ?date_to= plus any names in
    `extra_filter_fields` (e.g. customer, supplier).
    """

    permission_classes = [permissions.IsAuthenticated]
    extra_filter_fields = ()

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset().filter(company_id__in=get_visible_company_ids(user))
        branch_ids = get_visible_branch_ids(user)
        if branch_ids is not None:
            qs = qs.filter(branch_id__in=branch_ids)

        params = self.request.query_params
        for name in ('company', 'branch', 'status', *self.extra_filter_fields):
            if params.get(name):
                qs = qs.filter(**{name: params[name]})
        if params.get('date_from'):
            qs = qs.filter(date__gte=params['date_from'])
        if params.get('date_to'):
            qs = qs.filter(date__lte=params['date_to'])
        return qs


def check_company_access(user, company):
    if company.id not in get_visible_company_ids(user):
        raise serializers.ValidationError({'company': 'You do not have access to this company.'})


def check_branch_access(user, company, branch):
    if branch is None:
        return
    if branch.company_id != company.id:
        raise serializers.ValidationError({'branch': 'Branch must belong to the selected company.'})
    branch_ids = get_visible_branch_ids(user)
    if branch_ids is not None and branch.id not in branch_ids:
        raise serializers.ValidationError({'branch': 'You do not have access to this branch.'})


def check_same_company(company, **objects):
    """Each named object (supplier, warehouse, ...) must belong to `company`."""
    for field, obj in objects.items():
        if obj is not None and obj.company_id != company.id:
            label = field.replace('_', ' ').capitalize()
            raise serializers.ValidationError({field: f'{label} must belong to the selected company.'})
