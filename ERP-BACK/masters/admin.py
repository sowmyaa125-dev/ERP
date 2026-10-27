from django.contrib import admin

from .models import Brand, Category, GSTMaster, Group, SubCategory, SubGroup, UnitMaster, Warehouse


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'company', 'status']
    list_filter = ['status', 'company']


@admin.register(SubGroup)
class SubGroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'group', 'company', 'status']
    list_filter = ['status', 'company']


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'company', 'status']
    list_filter = ['status', 'company']


@admin.register(SubCategory)
class SubCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'company', 'status']
    list_filter = ['status', 'company']


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ['name', 'company', 'status']
    list_filter = ['status', 'company']


@admin.register(GSTMaster)
class GSTMasterAdmin(admin.ModelAdmin):
    list_display = ['name', 'percentage', 'company', 'status']
    list_filter = ['status', 'company']


@admin.register(UnitMaster)
class UnitMasterAdmin(admin.ModelAdmin):
    list_display = ['name', 'short_name', 'company', 'status']
    list_filter = ['status', 'company']


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'company', 'branch', 'status']
    list_filter = ['status', 'company']