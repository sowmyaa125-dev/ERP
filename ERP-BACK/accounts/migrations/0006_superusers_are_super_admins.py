from django.db import migrations


def flag_superusers(apps, schema_editor):
    """Existing Django superusers (made with createsuperuser) become ERP Super Admins."""
    User = apps.get_model('accounts', 'User')
    User.objects.filter(is_superuser=True, is_super_admin=False).update(
        is_super_admin=True, approval_status='APPROVED', email_verified=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_registrationotp_attempts_registrationotp_purpose'),
    ]

    operations = [
        migrations.RunPython(flag_superusers, migrations.RunPython.noop),
    ]
