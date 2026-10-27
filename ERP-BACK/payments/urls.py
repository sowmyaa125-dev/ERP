from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import OutstandingView, PartyLedgerView, PaymentViewSet

router = DefaultRouter()
router.register('payments', PaymentViewSet, basename='payment')

urlpatterns = router.urls + [
    path('ledger/', PartyLedgerView.as_view(), name='party_ledger'),
    path('outstanding/', OutstandingView.as_view(), name='outstanding'),
]
