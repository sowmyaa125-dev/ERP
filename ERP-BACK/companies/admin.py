from django.contrib import admin

from .models import Branch, Company, Department, Role


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ['name', 'company_type', 'parent_company', 'status']
    list_filter = ['company_type', 'status']
    search_fields = ['name', 'legal_name', 'email']


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ['name', 'branch_code', 'company', 'status']
    list_filter = ['status', 'company']
    search_fields = ['name', 'branch_code']


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'company', 'branch', 'status']
    list_filter = ['status', 'company']
    search_fields = ['name', 'code']

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'company', 'scope']
    list_filter = ['scope', 'company']
    search_fields = ['name']
    filter_horizontal = ['scoped_branches', 'scoped_sub_companies']