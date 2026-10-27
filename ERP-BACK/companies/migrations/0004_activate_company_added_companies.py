from django.db import migrations


def activate(apps, schema_editor):
    """
    Companies used to be saved as PENDING by default even when a company
    added them itself. Only self-registrations need Super Admin approval,
    so activate every PENDING company that has no registration waiting.
    """
    Company = apps.get_model('companies', 'Company')
    User = apps.get_model('accounts', 'User')
    awaiting = User.objects.filter(approval_status='PENDING', company__isnull=False).values_list('company_id', flat=True)
    Company.objects.filter(status='PENDING').exclude(id__in=list(awaiting)).update(status='ACTIVE')


class Migration(migrations.Migration):

    dependencies = [
        ('companies', '0003_company_owner'),
        ('accounts', '0006_superusers_are_super_admins'),
    ]

    operations = [
        migrations.RunPython(activate, migrations.RunPython.noop),
    ]
