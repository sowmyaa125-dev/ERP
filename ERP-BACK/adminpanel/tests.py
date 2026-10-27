"""
The custom admin API must offer exactly what Django's /admin/ offers.
Run with:  python manage.py test adminpanel
"""
from django.contrib import admin
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from companies.models import Company
from customers.models import Customer
from masters.models import Warehouse
from products.models import Product
from sales.models import SalesInvoice, SalesInvoiceItem

BASE = '/api/admin/data'


class AdminPanelTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('boss@example.test', 'Boss#12345')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.company = Company.objects.create(name='Green Agro', company_type='MAIN', email='g@g.test', status='ACTIVE')
        Company.objects.create(name='Blue Farms', company_type='MAIN', email='b@b.test', status='INACTIVE')

    def test_requires_super_admin(self):
        user = User.objects.create_user('u@g.test', 'User#12345', company=self.company, must_change_password=False)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get(f'{BASE}/').status_code, 403)

    def test_index_lists_every_registered_model(self):
        data = self.client.get(f'{BASE}/').data
        listed = {(a['app_label'], m['model']) for a in data['apps'] for m in a['models']}
        registered = {(m._meta.app_label, m._meta.model_name) for m in admin.site._registry}
        self.assertEqual(listed, registered)
        companies = next(m for a in data['apps'] for m in a['models'] if m['model'] == 'company')
        self.assertEqual(companies['count'], 2)

    def test_changelist_search_filter_order_and_columns(self):
        res = self.client.get(f'{BASE}/companies/company/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([c['name'] for c in res.data['columns']], ['name', 'company_type', 'parent_company', 'status'])
        self.assertEqual([f['title'] for f in res.data['filters']], ['company type', 'status'])
        self.assertTrue(res.data['search']['enabled'])
        self.assertEqual(res.data['actions'][0]['name'], 'delete_selected')

        inactive = next(c for c in res.data['filters'][1]['choices'] if c['display'] == 'Inactive')
        filtered = self.client.get(f'{BASE}/companies/company/', inactive['params']).data
        self.assertEqual([r['str'] for r in filtered['rows']], ['Blue Farms'])

        self.assertEqual(self.client.get(f'{BASE}/companies/company/', {'q': 'green'}).data['pagination']['count'], 1)
        name_col = res.data['columns'][0]['index']
        desc = self.client.get(f'{BASE}/companies/company/', {'o': f'-{name_col}'}).data
        self.assertEqual([r['str'] for r in desc['rows']], ['Green Agro', 'Blue Farms'])

    def test_add_change_history_and_delete(self):
        schema = self.client.get(f'{BASE}/customers/customer/add/').data
        fields = {f['name']: f for fs in schema['fieldsets'] for f in fs['fields']}
        self.assertEqual(fields['company']['type'], 'select')
        self.assertEqual(fields['status']['type'], 'select')

        bad = self.client.post(f'{BASE}/customers/customer/add/', {'name': ''}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertIn('company', bad.data['errors'])

        made = self.client.post(f'{BASE}/customers/customer/add/', {
            'company': self.company.id, 'name': 'Murugan Farms', 'code': 'C1', 'status': 'ACTIVE',
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        pk = made.data['pk']

        change = self.client.get(f'{BASE}/customers/customer/{pk}/').data
        values = {f['name']: f.get('value') for fs in change['fieldsets'] for f in fs['fields']}
        values['phone'] = '9000000001'
        saved = self.client.post(f'{BASE}/customers/customer/{pk}/', values, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(Customer.objects.get(pk=pk).phone, '9000000001')

        history = self.client.get(f'{BASE}/customers/customer/{pk}/history/').data['entries']
        self.assertEqual([e['action'] for e in history], ['Changed', 'Added'])

        preview = self.client.get(f'{BASE}/customers/customer/{pk}/delete/').data
        self.assertEqual(preview['protected'], [])
        self.assertEqual(self.client.post(f'{BASE}/customers/customer/{pk}/delete/').status_code, 200)
        self.assertFalse(Customer.objects.filter(pk=pk).exists())

    def test_protected_delete_is_blocked(self):
        product = Product.objects.create(company=self.company, code='P1', name='Urea')
        customer = Customer.objects.create(company=self.company, name='C', code='C1')
        wh = Warehouse.objects.create(company=self.company, name='WH', code='W1')
        inv = SalesInvoice.objects.create(company=self.company, customer=customer, warehouse=wh, number='INV-1')
        SalesInvoiceItem.objects.create(invoice=inv, product=product, quantity=1, rate=1)
        preview = self.client.get(f'{BASE}/products/product/{product.pk}/delete/').data
        self.assertTrue(preview['protected'])
        self.assertEqual(self.client.post(f'{BASE}/products/product/{product.pk}/delete/').status_code, 409)

    def test_bulk_delete_action(self):
        a = Company.objects.create(name='Tmp A', company_type='MAIN', email='a@t.test')
        b = Company.objects.create(name='Tmp B', company_type='MAIN', email='b@t.test')
        url = f'{BASE}/companies/company/action/'
        preview = self.client.post(url, {'action': 'delete_selected', 'ids': [a.pk, b.pk]}, format='json')
        self.assertTrue(preview.data['preview'])
        done = self.client.post(url, {'action': 'delete_selected', 'ids': [a.pk, b.pk], 'confirm': True}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        self.assertFalse(Company.objects.filter(pk__in=[a.pk, b.pk]).exists())

    def test_user_add_change_and_password(self):
        schema = self.client.get(f'{BASE}/accounts/user/add/').data
        names = [f['name'] for fs in schema['fieldsets'] for f in fs['fields']]
        self.assertEqual(names, ['email', 'password1', 'password2'])

        made = self.client.post(f'{BASE}/accounts/user/add/', {
            'email': 'new@g.test', 'password1': 'Strong#Pass2026', 'password2': 'Strong#Pass2026',
        }, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        user = User.objects.get(email='new@g.test')
        self.assertTrue(user.check_password('Strong#Pass2026'))

        change = self.client.get(f'{BASE}/accounts/user/{user.pk}/').data
        fields = {f['name']: f for fs in change['fieldsets'] for f in fs['fields']}
        self.assertEqual(fields['password']['type'], 'password_hash')
        self.assertEqual(fields['groups']['type'], 'multiselect')
        self.assertTrue(change['can_change_password'])
        self.assertEqual([fs['title'] for fs in change['fieldsets']],
                         [None, 'Personal info', 'Organization', 'Permissions', 'Important dates'])

        pw = self.client.post(f'{BASE}/accounts/user/{user.pk}/password/', {
            'password1': 'Another#Pass2026', 'password2': 'Another#Pass2026',
        }, format='json')
        self.assertEqual(pw.status_code, 200, pw.data)
        user.refresh_from_db()
        self.assertTrue(user.check_password('Another#Pass2026'))

    def test_ledger_records_are_view_only(self):
        customer = Customer.objects.create(company=self.company, name='C', code='C1')
        wh = Warehouse.objects.create(company=self.company, name='WH', code='W1')
        inv = SalesInvoice.objects.create(company=self.company, customer=customer, warehouse=wh, number='INV-1')
        listing = self.client.get(f'{BASE}/sales/salesinvoice/').data
        self.assertEqual(listing['perms'], {'view': True, 'add': False, 'change': False, 'delete': False})
        detail = self.client.get(f'{BASE}/sales/salesinvoice/{inv.pk}/').data
        self.assertTrue(all(f['type'] == 'readonly' for fs in detail['fieldsets'] for f in fs['fields']))
        self.assertEqual(detail['inlines'][0]['model'], 'salesinvoiceitem')
        self.assertEqual(self.client.post(f'{BASE}/sales/salesinvoice/{inv.pk}/', {}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{BASE}/sales/salesinvoice/{inv.pk}/delete/').status_code, 403)
