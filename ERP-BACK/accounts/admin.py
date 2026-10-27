from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ['email']
    list_display = ['email', 'full_name', 'company', 'branch', 'department', 'is_active', 'is_staff']
    search_fields = ['email', 'first_name', 'last_name']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name')}),
        ('Organization', {'fields': ('company', 'branch', 'department', 'designation', 'role')}),
        ('Permissions', {'fields': (
            'is_active', 'is_staff', 'is_superuser', 'is_super_admin',
            'must_change_password', 'groups', 'user_permissions',
        )}),
        ('Important dates', {'fields': ('last_login',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2'),
        }),
    )