class ReadOnlyAdminMixin:
    """
    View-only admin for ledger-style records (invoices, bills, payments, stock).
    Editing or deleting them outside the app would bypass stock posting and
    payment totals, so changes must go through the app's own cancel flows.
    """

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
