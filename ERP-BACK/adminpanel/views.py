"""
JSON mirror of Django's built-in admin (/admin/) for the in-app Super Admin console.

Everything is driven by `django.contrib.admin.site`: the same registered models,
list columns, filters, search, ordering, pagination, fieldsets, readonly fields,
inlines, actions, forms, validation, permissions, delete checks and history log.
Registering a model (or changing a ModelAdmin) automatically changes these pages.

Mounted at /api/admin/data/ and restricted to Super Admins; per-model
view/add/change/delete rights come from the ModelAdmin itself.
"""
import json
import re
from datetime import date, datetime, time
from decimal import Decimal

from django import forms
from django.apps import apps
from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.admin.options import IncorrectLookupParameters
from django.contrib.admin.utils import (
    display_for_field, display_for_value, get_deleted_objects, label_for_field, lookup_field,
)
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import FieldDoesNotExist, ObjectDoesNotExist, PermissionDenied
from django.db import models, transaction
from django.db.models.fields.files import FieldFile
from django.forms.models import _get_foreign_key
from django.http import Http404, QueryDict
from django.utils.datastructures import MultiValueDict
from django.utils.html import strip_tags
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin

OPTION_LIMIT = 1000  # max choices sent for a select / multi-select


# ---------------------------------------------------------------- helpers

def _model_admin(app_label, model_name):
    try:
        model = apps.get_model(app_label, model_name)
    except LookupError:
        raise Http404('Unknown model.')
    model_admin = admin.site._registry.get(model)
    if model_admin is None:
        raise Http404('This model is not registered in the admin.')
    return model, model_admin


def _http(request):
    """The underlying Django HttpRequest (user already set by DRF auth)."""
    return request._request


def _perms(model_admin, req, obj=None):
    return {
        'view': model_admin.has_view_permission(req, obj),
        'add': model_admin.has_add_permission(req),
        'change': model_admin.has_change_permission(req, obj),
        'delete': model_admin.has_delete_permission(req, obj),
    }


def _jsonable(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, models.Model):
        return value.pk
    if isinstance(value, FieldFile):
        return value.url if value else None
    if isinstance(value, (list, tuple, set)) or hasattr(value, '__iter__'):
        return [_jsonable(v) for v in value]
    return str(value)


def _display(name, obj, model_admin):
    """How the admin would show `name` for `obj`: {'text': ...} or {'bool': ...}."""
    empty = model_admin.get_empty_value_display()
    try:
        field, attr, value = lookup_field(name, obj, model_admin)
    except (AttributeError, ObjectDoesNotExist, FieldDoesNotExist):
        return {'text': empty}

    if field is None or getattr(field, 'auto_created', False) and not getattr(field, 'concrete', True):
        if getattr(attr, 'boolean', False):
            return {'bool': None if value is None else bool(value)}
        return {'text': strip_tags(str(display_for_value(value, empty)))}

    if isinstance(field, models.BooleanField):
        return {'bool': value}
    if field.many_to_many:
        return {'text': ', '.join(str(v) for v in value.all()) or empty}
    if field.is_relation:
        return {'text': str(value) if value is not None else empty}
    if isinstance(field, models.FileField):
        return {'text': value.name if value else empty, 'url': value.url if value else None}
    return {'text': strip_tags(str(display_for_field(value, field, empty)))}


def _label(name, model, model_admin):
    try:
        return str(label_for_field(name, model, model_admin))
    except AttributeError:
        return name.replace('_', ' ').capitalize()


def _flatten(fields):
    """Fieldset 'fields' may contain tuples (several fields on one line)."""
    for f in fields:
        if isinstance(f, (list, tuple)):
            yield from f
        else:
            yield f


def _options(queryset, form_field):
    qs = queryset[:OPTION_LIMIT + 1]
    rows = [{'value': o.pk, 'label': str(form_field.label_from_instance(o))} for o in qs[:OPTION_LIMIT]]
    return rows, len(qs) > OPTION_LIMIT


def _describe_field(name, field, bound):
    """Turn a (admin) form field into a JSON widget description for the frontend."""
    widget = field.widget
    while hasattr(widget, 'widget') and not isinstance(widget, forms.MultiWidget):  # RelatedFieldWidgetWrapper
        widget = widget.widget
    raw_help = str(field.help_text or '')
    help_items = [strip_tags(item).strip() for item in re.findall(r'<li>(.*?)</li>', raw_help, re.S)]
    info = {
        'name': name,
        'label': str(field.label or name.replace('_', ' ').capitalize()),
        # Django sends rule lists (e.g. password rules) as <ul>; keep them as a list for the UI.
        'help_text': '' if help_items else strip_tags(raw_help),
        'help_list': help_items,
        'required': field.required,
        'disabled': field.disabled,
        'value': _jsonable(bound.value()),
    }

    from django.contrib.auth.forms import ReadOnlyPasswordHashField
    if isinstance(field, ReadOnlyPasswordHashField):
        info.update(type='password_hash', value=None, disabled=True)
    elif isinstance(field, forms.ModelMultipleChoiceField):
        info['options'], info['options_truncated'] = _options(field.queryset, field)
        info['type'] = 'multiselect'
    elif isinstance(field, forms.ModelChoiceField):
        info['options'], info['options_truncated'] = _options(field.queryset, field)
        info['type'] = 'select'
    elif isinstance(field, forms.NullBooleanField):
        info['type'] = 'nullboolean'
    elif isinstance(field, forms.BooleanField):
        info['type'] = 'checkbox'
    elif isinstance(field, (forms.MultipleChoiceField,)):
        info.update(type='multiselect', options=[{'value': v, 'label': str(l)} for v, l in field.choices], options_truncated=False)
    elif isinstance(field, forms.ChoiceField):
        info.update(type='select', options=[{'value': v, 'label': str(l)} for v, l in field.choices if v != ''], options_truncated=False)
    elif isinstance(field, forms.SplitDateTimeField) or isinstance(field, forms.DateTimeField):
        info['type'] = 'datetime'
    elif isinstance(field, forms.DateField):
        info['type'] = 'date'
    elif isinstance(field, forms.TimeField):
        info['type'] = 'time'
    elif isinstance(field, (forms.DecimalField, forms.FloatField)):
        info['type'] = 'number'
        info['step'] = 'any'
    elif isinstance(field, forms.IntegerField):
        info['type'] = 'number'
        info['step'] = '1'
    elif isinstance(field, forms.EmailField):
        info['type'] = 'email'
    elif isinstance(field, forms.URLField):
        info['type'] = 'url'
    elif isinstance(field, forms.FileField):
        info['type'] = 'file'
        initial = bound.initial
        info['value'] = initial.url if initial else None
        info['current_name'] = initial.name if initial else None
    elif isinstance(widget, forms.PasswordInput):
        info['type'] = 'password'
        info['value'] = ''
    elif isinstance(widget, forms.Textarea):
        info['type'] = 'textarea'
    else:
        info['type'] = 'text'
        if getattr(field, 'max_length', None):
            info['max_length'] = field.max_length
    return info


def _form_schema(model, model_admin, req, obj):
    """Fieldsets with editable fields described and readonly fields rendered, like the admin change form."""
    form_class = model_admin.get_form(req, obj, change=obj is not None)
    form = form_class(instance=obj) if issubclass(form_class, forms.ModelForm) else form_class()
    readonly = set(model_admin.get_readonly_fields(req, obj))
    can_edit = model_admin.has_change_permission(req, obj) if obj else model_admin.has_add_permission(req)

    fieldsets = []
    for title, opts in model_admin.get_fieldsets(req, obj):
        rows = []
        for name in _flatten(opts.get('fields', ())):
            if name in form.fields and name not in readonly and can_edit:
                rows.append(_describe_field(name, form.fields[name], form[name]))
            else:
                shown = _display(name, obj, model_admin) if obj is not None else {'text': model_admin.get_empty_value_display()}
                rows.append({'name': name, 'label': _label(name, model, model_admin), 'type': 'readonly', **shown})
        fieldsets.append({
            'title': str(title) if title else None,
            'description': strip_tags(str(opts.get('description') or '')),
            'collapsed': 'collapse' in opts.get('classes', ()),
            'fields': rows,
        })
    return form_class, fieldsets


def _inlines(model_admin, req, obj):
    """Inline tables (read-only rows), like the admin's tabular inlines."""
    result = []
    if obj is None:
        return result
    for inline in model_admin.get_inline_instances(req, obj):
        fk = _get_foreign_key(model_admin.model, inline.model, fk_name=inline.fk_name)
        names = [n for n in inline.get_fields(req, obj) if n != fk.name]
        rows = inline.get_queryset(req).filter(**{fk.name: obj})
        result.append({
            'title': str(inline.verbose_name_plural or inline.model._meta.verbose_name_plural).capitalize(),
            'model': inline.model._meta.model_name,
            'app_label': inline.model._meta.app_label,
            'columns': [{'name': n, 'label': _label(n, inline.model, inline)} for n in names],
            'rows': [
                {'pk': r.pk, 'str': str(r), 'values': [_display(n, r, inline) for n in names]}
                for r in rows
            ],
        })
    return result


def _form_data(form_class, payload):
    """Convert JSON values into the POST shape admin forms expect (split datetimes, checkboxes, lists)."""
    data = MultiValueDict()
    for name, field in form_class.base_fields.items():
        if name not in payload or field.disabled:
            continue
        value = payload[name]
        widget = field.widget
        while hasattr(widget, 'widget') and not isinstance(widget, forms.MultiWidget):
            widget = widget.widget
        if isinstance(field, (forms.ModelMultipleChoiceField, forms.MultipleChoiceField)):
            data.setlist(name, [str(v) for v in (value or [])])
        elif isinstance(widget, forms.SplitDateTimeWidget):
            text = str(value or '')
            d, _, t = text.replace(' ', 'T').partition('T')
            data[f'{name}_0'] = d
            data[f'{name}_1'] = t[:8]
        elif isinstance(field, forms.NullBooleanField):
            data[name] = {True: 'true', False: 'false'}.get(value, 'unknown')
        elif isinstance(field, forms.BooleanField):
            if value:
                data[name] = 'on'
        elif isinstance(field, forms.FileField):
            if value is False:  # clear the current file
                data[f'{name}-clear'] = 'on'
        else:
            data[name] = '' if value is None else str(value)
    return data


def _errors(form):
    errors = form.errors.get_json_data()
    return {k if k != '__all__' else 'non_field_errors': [e['message'] for e in v] for k, v in errors.items()}


def _parse_payload(request):
    raw = request.data.get('payload') if hasattr(request.data, 'get') else None
    if isinstance(raw, str):
        return json.loads(raw)
    return {k: v for k, v in request.data.items()} if not isinstance(request.data, dict) else dict(request.data)


def _log_entry(entry):
    return {
        'id': entry.id,
        'action_time': entry.action_time,
        'user': str(entry.user),
        'action': {1: 'Added', 2: 'Changed', 3: 'Deleted'}.get(entry.action_flag, 'Changed'),
        'object_repr': entry.object_repr,
        'object_id': entry.object_id,
        'change_message': entry.get_change_message(),
        'app_label': entry.content_type.app_label if entry.content_type else None,
        'model': entry.content_type.model if entry.content_type else None,
        'model_name': str(entry.content_type.model_class()._meta.verbose_name).capitalize()
        if entry.content_type and entry.content_type.model_class() else None,
    }


class AdminDataView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSuperAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]


# ---------------------------------------------------------------- index

class IndexView(AdminDataView):
    """GET /api/admin/data/ — the admin home page: apps, models, counts, recent actions."""

    def get(self, request):
        req = _http(request)
        app_list = []
        for app in admin.site.get_app_list(req):
            models_out = []
            for m in app['models']:
                model = m['model']
                model_admin = admin.site._registry[model]
                models_out.append({
                    'model': model._meta.model_name,
                    'name': str(m['name']),
                    'name_singular': str(model._meta.verbose_name).capitalize(),
                    'count': model_admin.get_queryset(req).count() if m['perms'].get('view') or m['perms'].get('change') else None,
                    'perms': {k: bool(m['perms'].get(k)) for k in ('view', 'add', 'change', 'delete')},
                })
            app_list.append({'app_label': app['app_label'], 'name': str(app['name']), 'models': models_out})
        recent = LogEntry.objects.select_related('content_type', 'user').order_by('-action_time')[:15]
        return Response({'apps': app_list, 'recent_actions': [_log_entry(e) for e in recent]})


# ---------------------------------------------------------------- changelist

class ChangeListView(AdminDataView):
    """
    GET /api/admin/data/<app>/<model>/?q=&o=&p=&<filter params>
    Runs Django's own ChangeList, so search, filters, ordering and paging match /admin/ exactly.
    """

    def get(self, request, app_label, model_name):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        if not (model_admin.has_view_permission(req) or model_admin.has_change_permission(req)):
            raise PermissionDenied

        original_get = req.GET
        req.GET = QueryDict(request.query_params.urlencode(), mutable=False)
        try:
            cl = model_admin.get_changelist_instance(req)
        except IncorrectLookupParameters:
            req.GET = original_get
            return Response({'detail': 'Invalid filter.'}, status=status.HTTP_400_BAD_REQUEST)
        finally:
            req.GET = original_get

        ordering = cl.get_ordering_field_columns()
        columns = []
        for index, name in enumerate(cl.list_display):
            if name == 'action_checkbox':
                continue
            sortable = False
            if cl.sortable_by is None or name in cl.sortable_by:
                try:
                    f = model._meta.get_field(name)
                    sortable = not f.many_to_many and not (f.is_relation and f.auto_created)
                except FieldDoesNotExist:
                    attr = getattr(model_admin, name, None) or getattr(model, name, None)
                    sortable = bool(getattr(attr, 'admin_order_field', None))
            columns.append({
                'name': name,
                'label': _label(name, model, model_admin) if name != '__str__' else str(model._meta.verbose_name).capitalize(),
                'index': index,
                'sortable': sortable,
                'sorted': ordering.get(index),
            })

        rows = [
            {'pk': obj.pk, 'str': str(obj), 'values': [_display(c['name'], obj, model_admin) for c in columns]}
            for obj in cl.result_list
        ]

        filters = []
        for spec in cl.filter_specs:
            choices = []
            for choice in spec.choices(cl):
                qs = choice.get('query_string', '')
                params = QueryDict(qs.lstrip('?'))
                choices.append({
                    'display': str(choice.get('display')),
                    'selected': bool(choice.get('selected')),
                    'params': {k: params.get(k) for k in params.keys()},
                })
            filters.append({'title': str(spec.title), 'choices': choices})

        actions = [  # descriptions arrive already formatted by the admin
            {'name': name, 'description': strip_tags(str(desc))}
            for name, desc in model_admin.get_action_choices(req, default_choices=[]) if name
        ]

        return Response({
            'app_label': app_label,
            'model': model_name,
            'name': str(model._meta.verbose_name_plural).capitalize(),
            'name_singular': str(model._meta.verbose_name).capitalize(),
            'columns': columns,
            'rows': rows,
            'filters': filters,
            'search': {'enabled': bool(cl.search_fields), 'query': cl.query},
            'date_hierarchy': model_admin.date_hierarchy,
            'pagination': {
                'page': cl.page_num,
                'pages': cl.paginator.num_pages,
                'per_page': cl.list_per_page,
                'count': cl.result_count,
                'total': cl.full_result_count,
            },
            'actions': actions,
            'perms': _perms(model_admin, req),
            'params': {k: request.query_params.get(k) for k in request.query_params.keys()},
        })


class ActionView(AdminDataView):
    """
    POST /api/admin/data/<app>/<model>/action/
      {"action": "delete_selected", "ids": [..], "confirm": false}  -> preview (what would be deleted)
      {"action": "delete_selected", "ids": [..], "confirm": true}   -> delete
    Other admin actions are run directly and their messages returned.
    """

    def post(self, request, app_label, model_name):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        name = request.data.get('action')
        ids = request.data.get('ids') or []
        actions = model_admin.get_actions(req)
        if name not in actions:
            return Response({'detail': 'Unknown action.'}, status=status.HTTP_400_BAD_REQUEST)
        queryset = model_admin.get_queryset(req).filter(pk__in=ids)
        if not queryset.exists():
            return Response({'detail': 'Select at least one item.'}, status=status.HTTP_400_BAD_REQUEST)

        if name == 'delete_selected':
            if not model_admin.has_delete_permission(req):
                raise PermissionDenied
            _, model_count, perms_needed, protected = model_admin.get_deleted_objects(queryset, req)
            summary = {
                'model_count': {str(k): v for k, v in model_count.items()},
                'protected': [strip_tags(str(p)) for p in protected],
                'perms_needed': sorted(str(p) for p in perms_needed),
            }
            if not request.data.get('confirm') or protected or perms_needed:
                return Response({'preview': True, **summary},
                                status=status.HTTP_200_OK if not (protected or perms_needed) else status.HTTP_409_CONFLICT)
            count = queryset.count()
            with transaction.atomic():
                model_admin.log_deletions(req, queryset)
                model_admin.delete_queryset(req, queryset)
            return Response({'detail': f'Successfully deleted {count} {model._meta.verbose_name_plural}.'})

        func, _, _ = actions[name]
        from django.contrib.messages import get_messages
        func(model_admin, req, queryset)
        messages = [str(m) for m in get_messages(req)]
        return Response({'detail': ' '.join(messages) or 'Action completed.'})


# ---------------------------------------------------------------- add / change / delete / history

class AddView(AdminDataView):
    """GET schema for the add form; POST to create (same validation as the admin add page)."""

    def get(self, request, app_label, model_name):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        if not model_admin.has_add_permission(req):
            raise PermissionDenied
        _, fieldsets = _form_schema(model, model_admin, req, None)
        return Response({
            'name_singular': str(model._meta.verbose_name).capitalize(),
            'name': str(model._meta.verbose_name_plural).capitalize(),
            'fieldsets': fieldsets,
            'perms': _perms(model_admin, req),
        })

    def post(self, request, app_label, model_name):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        if not model_admin.has_add_permission(req):
            raise PermissionDenied
        form_class = model_admin.get_form(req, None, change=False)
        form = form_class(_form_data(form_class, _parse_payload(request)), request.FILES or None)
        if not form.is_valid():
            return Response({'errors': _errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            obj = form.save(commit=False)
            model_admin.save_model(req, obj, form, change=False)
            form.save_m2m()
            model_admin.log_addition(req, obj, model_admin.construct_change_message(req, form, None, add=True))
        return Response({'pk': obj.pk, 'str': str(obj),
                         'detail': f'The {model._meta.verbose_name} “{obj}” was added successfully.'},
                        status=status.HTTP_201_CREATED)


class ChangeView(AdminDataView):
    """GET one object as the admin change form; POST to save; DELETE to delete."""

    def _object(self, model_admin, req, object_id):
        obj = model_admin.get_object(req, object_id)
        if obj is None:
            raise Http404('Object not found.')
        return obj

    def get(self, request, app_label, model_name, object_id):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        obj = self._object(model_admin, req, object_id)
        if not (model_admin.has_view_permission(req, obj) or model_admin.has_change_permission(req, obj)):
            raise PermissionDenied
        _, fieldsets = _form_schema(model, model_admin, req, obj)
        from django.contrib.auth.admin import UserAdmin
        return Response({
            'pk': obj.pk,
            'str': str(obj),
            'name_singular': str(model._meta.verbose_name).capitalize(),
            'name': str(model._meta.verbose_name_plural).capitalize(),
            'fieldsets': fieldsets,
            'inlines': _inlines(model_admin, req, obj),
            'perms': _perms(model_admin, req, obj),
            'can_change_password': isinstance(model_admin, UserAdmin) and model_admin.has_change_permission(req, obj),
        })

    def post(self, request, app_label, model_name, object_id):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        obj = self._object(model_admin, req, object_id)
        if not model_admin.has_change_permission(req, obj):
            raise PermissionDenied
        form_class = model_admin.get_form(req, obj, change=True)
        form = form_class(_form_data(form_class, _parse_payload(request)), request.FILES or None, instance=obj)
        if not form.is_valid():
            return Response({'errors': _errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            obj = form.save(commit=False)
            model_admin.save_model(req, obj, form, change=True)
            form.save_m2m()
            model_admin.log_change(req, obj, model_admin.construct_change_message(req, form, None, add=False))
        return Response({'pk': obj.pk, 'str': str(obj),
                         'detail': f'The {model._meta.verbose_name} “{obj}” was changed successfully.'})


class DeleteView(AdminDataView):
    """GET: what deleting this object would remove (and what blocks it). POST: delete."""

    def _prepare(self, request, app_label, model_name, object_id):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        obj = model_admin.get_object(req, object_id)
        if obj is None:
            raise Http404('Object not found.')
        if not model_admin.has_delete_permission(req, obj):
            raise PermissionDenied
        _, model_count, perms_needed, protected = get_deleted_objects([obj], req, model_admin.admin_site)
        summary = {
            'object': str(obj),
            'model_count': {str(k): v for k, v in model_count.items()},
            'protected': [strip_tags(str(p)) for p in protected],
            'perms_needed': sorted(str(p) for p in perms_needed),
        }
        return model, model_admin, req, obj, summary

    def get(self, request, app_label, model_name, object_id):
        return Response(self._prepare(request, app_label, model_name, object_id)[4])

    def post(self, request, app_label, model_name, object_id):
        model, model_admin, req, obj, summary = self._prepare(request, app_label, model_name, object_id)
        if summary['protected'] or summary['perms_needed']:
            return Response({'detail': 'This object cannot be deleted.', **summary}, status=status.HTTP_409_CONFLICT)
        name = str(obj)
        with transaction.atomic():
            model_admin.log_deletions(req, model.objects.filter(pk=obj.pk))
            model_admin.delete_model(req, obj)
        return Response({'detail': f'The {model._meta.verbose_name} “{name}” was deleted successfully.'})


class HistoryView(AdminDataView):
    """GET /api/admin/data/<app>/<model>/<id>/history/ — the admin 'History' page."""

    def get(self, request, app_label, model_name, object_id):
        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        obj = model_admin.get_object(req, object_id)
        if obj is None:
            raise Http404('Object not found.')
        if not (model_admin.has_view_permission(req, obj) or model_admin.has_change_permission(req, obj)):
            raise PermissionDenied
        entries = LogEntry.objects.filter(
            object_id=str(obj.pk), content_type=ContentType.objects.get_for_model(model, for_concrete_model=False),
        ).select_related('user', 'content_type').order_by('-action_time')
        return Response({'str': str(obj), 'entries': [_log_entry(e) for e in entries]})


class PasswordView(AdminDataView):
    """POST /api/admin/data/<app>/<model>/<id>/password/ — the admin 'change password' form for users."""

    def post(self, request, app_label, model_name, object_id):
        from django.contrib.auth.admin import UserAdmin

        model, model_admin = _model_admin(app_label, model_name)
        req = _http(request)
        if not isinstance(model_admin, UserAdmin):
            raise Http404
        user = model_admin.get_object(req, object_id)
        if user is None:
            raise Http404
        if not model_admin.has_change_permission(req, user):
            raise PermissionDenied
        form = model_admin.change_password_form(user, {
            'password1': request.data.get('password1', ''),
            'password2': request.data.get('password2', ''),
            'usable_password': 'true',
        })
        if not form.is_valid():
            return Response({'errors': _errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        form.save()
        change_message = model_admin.construct_change_message(req, form, None)
        model_admin.log_change(req, user, change_message)
        return Response({'detail': 'Password changed successfully.'})
