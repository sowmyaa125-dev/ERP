from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    # Custom admin: JSON mirror of every page in Django's /admin/ (Super Admin only).
    path('api/admin/data/', include('adminpanel.urls')),
    path('api/admin/', include('accounts.admin_urls')),
    path('api/', include('companies.urls')),
    path('api/', include('customers.urls')),
    path('api/', include('suppliers.urls')),
    path('api/', include('masters.urls')),
    path('api/', include('products.urls')),
    path('api/', include('stock.urls')),
    path('api/', include('purchases.urls')),
    path('api/', include('sales.urls')),
    path('api/', include('payments.urls')),
    path('api/', include('reports.urls')),
    path('api-auth/', include('rest_framework.urls')),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)