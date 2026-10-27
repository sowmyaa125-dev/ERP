from django.urls import path

from .views import (
    ActionView, AddView, ChangeListView, ChangeView, DeleteView, HistoryView, IndexView, PasswordView,
)

urlpatterns = [
    path('', IndexView.as_view(), name='admindata_index'),
    path('<str:app_label>/<str:model_name>/', ChangeListView.as_view(), name='admindata_changelist'),
    path('<str:app_label>/<str:model_name>/action/', ActionView.as_view(), name='admindata_action'),
    path('<str:app_label>/<str:model_name>/add/', AddView.as_view(), name='admindata_add'),
    path('<str:app_label>/<str:model_name>/<str:object_id>/', ChangeView.as_view(), name='admindata_change'),
    path('<str:app_label>/<str:model_name>/<str:object_id>/delete/', DeleteView.as_view(), name='admindata_delete'),
    path('<str:app_label>/<str:model_name>/<str:object_id>/history/', HistoryView.as_view(), name='admindata_history'),
    path('<str:app_label>/<str:model_name>/<str:object_id>/password/', PasswordView.as_view(), name='admindata_password'),
]
