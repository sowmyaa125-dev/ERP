from rest_framework.routers import DefaultRouter

from .views import (
    BrandViewSet, CategoryViewSet, GSTMasterViewSet, GroupViewSet,
    SubCategoryViewSet, SubGroupViewSet, UnitMasterViewSet, WarehouseViewSet,
)

router = DefaultRouter()
router.register('groups', GroupViewSet, basename='group')
router.register('sub-groups', SubGroupViewSet, basename='subgroup')
router.register('categories', CategoryViewSet, basename='category')
router.register('sub-categories', SubCategoryViewSet, basename='subcategory')
router.register('brands', BrandViewSet, basename='brand')
router.register('gst-masters', GSTMasterViewSet, basename='gstmaster')
router.register('unit-masters', UnitMasterViewSet, basename='unitmaster')
router.register('warehouses', WarehouseViewSet, basename='warehouse')

urlpatterns = router.urls