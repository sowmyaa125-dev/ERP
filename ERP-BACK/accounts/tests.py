"""
Company registration by Super Admin, forced OTP password change on first
login, and the Main/Sub company hierarchy under a registered company.
Run with:  python manage.py test accounts
"""
import re

from django.core import mail
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import RegistrationOTP, User
from companies.models import Company

NEW_PASSWORD = 'Harvest#2026-Strong'


class CompanyOnboardingTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('root@example.test', 'Admin#12345', is_super_admin=True)
        self.client = APIClient()

    def register(self, **extra):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/companies/register/', {
            'name': 'Green Agro', 'email': 'office@greenagro.test', 'state': 'TN',
            'admin_email': 'owner@greenagro.test', 'admin_first_name': 'Ravi', **extra,
        }, format='json')
        self.client.force_authenticate(None)
        return res

    def login(self, email, password):
        res = self.client.post('/api/auth/login/', {'email': email, 'password': password}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return res.data

    def latest_code(self):
        return re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    def onboard(self):
        """Register, log in with the temp password, complete the OTP change."""
        creds = self.register().data['credentials']
        self.login(creds['username'], creds['password'])
        self.client.post('/api/auth/password-change/request-otp/')
        res = self.client.post('/api/auth/password-change/confirm/', {
            'code': self.latest_code(), 'new_password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD,
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        return User.objects.get(email=creds['username'])

    # ---------- registration ----------

    def test_super_admin_registers_company_with_credentials(self):
        res = self.register()
        self.assertEqual(res.status_code, 201, res.data)
        creds = res.data['credentials']
        self.assertEqual(creds['username'], 'owner@greenagro.test')
        self.assertTrue(res.data['email_sent'])
        self.assertIn(creds['password'], mail.outbox[0].body)

        company = Company.objects.get(name='Green Agro')
        self.assertEqual((company.company_type, company.status, company.owner), ('MAIN', 'ACTIVE', None))
        user = User.objects.get(email='owner@greenagro.test')
        self.assertTrue(user.must_change_password)
        self.assertEqual(user.company, company)

    def test_super_admin_can_choose_password(self):
        res = self.register(admin_password='Chosen#Pass99')
        self.assertEqual(res.data['credentials']['password'], 'Chosen#Pass99')
        self.assertEqual(self.register(admin_email='x@greenagro.test', admin_password='123').status_code, 400)

    def test_only_super_admin_can_register(self):
        user = self.onboard()
        self.client.force_authenticate(user)
        res = self.client.post('/api/companies/register/', {
            'name': 'X', 'email': 'x@x.test', 'admin_email': 'x@x.test',
        }, format='json')
        self.assertEqual(res.status_code, 403)

    # ---------- forced password change ----------

    def test_first_login_is_locked_until_password_changed(self):
        creds = self.register().data['credentials']
        data = self.login(creds['username'], creds['password'])
        self.assertTrue(data['user']['must_change_password'])

        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)
        blocked = self.client.get('/api/companies/')
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data['code'], 'password_change_required')
        # The old-password route cannot be used to skip the OTP.
        self.assertEqual(self.client.post('/api/auth/change-password/', {
            'old_password': creds['password'], 'new_password': NEW_PASSWORD,
        }, format='json').status_code, 403)

        res = self.client.post('/api/auth/password-change/request-otp/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(mail.outbox[-1].to, [creds['username']])
        self.assertEqual(self.client.post('/api/auth/password-change/request-otp/').status_code, 429)  # cooldown

        code = self.latest_code()
        bad = self.client.post('/api/auth/password-change/confirm/', {
            'code': '000000' if code != '000000' else '111111',
            'new_password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD,
        }, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertIn('4 attempts left', str(bad.data))

        mismatch = self.client.post('/api/auth/password-change/confirm/', {
            'code': code, 'new_password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD + 'x',
        }, format='json')
        self.assertEqual(mismatch.status_code, 400)
        reuse = self.client.post('/api/auth/password-change/confirm/', {
            'code': code, 'new_password': creds['password'], 'confirm_password': creds['password'],
        }, format='json')
        self.assertEqual(reuse.status_code, 400)

        ok = self.client.post('/api/auth/password-change/confirm/', {
            'code': code, 'new_password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD,
        }, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertFalse(ok.data['user']['must_change_password'])
        self.assertEqual(self.client.get('/api/companies/').status_code, 200)

        user = User.objects.get(email=creds['username'])
        self.assertTrue(user.check_password(NEW_PASSWORD))
        self.assertTrue(user.email_verified)
        # The code is single-use.
        self.assertEqual(self.client.post('/api/auth/password-change/confirm/', {
            'code': code, 'new_password': 'Another#Pass77', 'confirm_password': 'Another#Pass77',
        }, format='json').status_code, 400)

    def test_code_locks_after_five_wrong_attempts(self):
        creds = self.register().data['credentials']
        self.login(creds['username'], creds['password'])
        self.client.post('/api/auth/password-change/request-otp/')
        code = self.latest_code()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(RegistrationOTP.MAX_ATTEMPTS):
            self.client.post('/api/auth/password-change/confirm/', {
                'code': wrong, 'new_password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD,
            }, format='json')
        res = self.client.post('/api/auth/password-change/confirm/', {
            'code': code, 'new_password': NEW_PASSWORD, 'confirm_password': NEW_PASSWORD,
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Request a new code', str(res.data))

    # ---------- company hierarchy ----------

    def test_registered_company_adds_main_and_sub_companies(self):
        user = self.onboard()
        root = user.company
        self.client.force_authenticate(user)

        main2 = self.client.post('/api/companies/', {
            'admin_email': 'login1@example.test',
            'name': 'Green Seeds', 'company_type': 'MAIN', 'email': 'seeds@greenagro.test',
        }, format='json')
        self.assertEqual(main2.status_code, 201, main2.data)
        self.assertEqual(main2.data['owner'], root.id)
        self.assertEqual(main2.data['status'], 'ACTIVE')

        sub_of_root = self.client.post('/api/companies/', {
            'admin_email': 'login2@example.test',
            'name': 'Agro Retail', 'company_type': 'SUB', 'email': 'retail@greenagro.test',
        }, format='json')
        self.assertEqual(sub_of_root.status_code, 201, sub_of_root.data)
        self.assertEqual(sub_of_root.data['parent_company'], root.id)

        sub_of_main2 = self.client.post('/api/companies/', {
            'admin_email': 'login3@example.test',
            'name': 'Seeds Depot', 'company_type': 'SUB', 'parent_company': main2.data['id'],
            'email': 'depot@greenagro.test',
        }, format='json')
        self.assertEqual(sub_of_main2.status_code, 201, sub_of_main2.data)

        # A Sub cannot be the parent of another Sub.
        bad = self.client.post('/api/companies/', {
            'admin_email': 'login4@example.test',
            'name': 'Nope', 'company_type': 'SUB', 'parent_company': sub_of_root.data['id'], 'email': 'n@x.test',
        }, format='json')
        self.assertEqual(bad.status_code, 400)

        listed = self.client.get('/api/companies/').data
        self.assertEqual([c['display_name'] for c in listed], [
            'Green Agro',
            'Agro Retail (Sub of Green Agro)',
            'Green Seeds (Main)',
            'Seeds Depot (Sub of Green Seeds)',
        ])
        self.assertEqual(listed[0]['level'], 'REGISTERED')

        # The whole group can be used in other modules' company dropdowns.
        wh = self.client.post('/api/warehouses/', {
            'company': sub_of_main2.data['id'], 'name': 'Depot WH', 'code': 'D1',
        }, format='json')
        self.assertEqual(wh.status_code, 201, wh.data)

    def test_other_groups_are_isolated(self):
        user = self.onboard()
        other_root = Company.objects.create(name='Other Co', company_type='MAIN', email='o@o.test', status='ACTIVE')
        self.client.force_authenticate(user)
        self.assertNotIn('Other Co', [c['name'] for c in self.client.get('/api/companies/').data])
        res = self.client.post('/api/companies/', {
            'admin_email': 'login5@example.test',
            'name': 'Sneaky', 'company_type': 'SUB', 'parent_company': other_root.id, 'email': 's@s.test',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_non_registered_main_and_sub_users_are_limited(self):
        root_user = self.onboard()
        root = root_user.company
        main2 = Company.objects.create(name='Green Seeds', company_type='MAIN', owner=root, email='s@g.test', status='ACTIVE')
        sub = Company.objects.create(name='Depot', company_type='SUB', parent_company=main2, owner=root, email='d@g.test', status='ACTIVE')

        main_user = User.objects.create_user('m@g.test', 'Pass#12345', company=main2, must_change_password=False)
        self.client.force_authenticate(main_user)
        self.assertEqual(self.client.post('/api/companies/', {
            'admin_email': 'login6@example.test',
            'name': 'X', 'company_type': 'MAIN', 'email': 'x@g.test',
        }, format='json').status_code, 400)
        made = self.client.post('/api/companies/', {
            'admin_email': 'login7@example.test','name': 'Y', 'company_type': 'SUB', 'email': 'y@g.test'}, format='json')
        self.assertEqual(made.status_code, 201, made.data)
        self.assertEqual((made.data['parent_company'], made.data['owner']), (main2.id, root.id))
        self.assertEqual({c['name'] for c in self.client.get('/api/companies/').data}, {'Green Seeds', 'Depot', 'Y'})

        sub_user = User.objects.create_user('s@g.test', 'Pass#12345', company=sub, must_change_password=False)
        self.client.force_authenticate(sub_user)
        self.assertEqual(self.client.post('/api/companies/', {
            'admin_email': 'login8@example.test',
            'name': 'Z', 'company_type': 'SUB', 'email': 'z@g.test',
        }, format='json').status_code, 400)

        # ...and the registered company sees the Sub created by the other Main.
        self.client.force_authenticate(root_user)
        self.assertIn('Y', [c['name'] for c in self.client.get('/api/companies/').data])


class AdminConsoleTests(TestCase):
    """The in-app Super Admin console API at /api/admin/."""

    def setUp(self):
        self.admin = User.objects.create_superuser('root@example.test', 'Admin#12345', is_super_admin=True)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/companies/register/', {
            'name': 'Green Agro', 'email': 'office@greenagro.test',
            'admin_email': 'owner@greenagro.test', 'admin_password': 'Temp#Pass123',
        }, format='json')
        self.root = Company.objects.get(pk=res.data['company']['id'])
        self.owner = User.objects.get(email='owner@greenagro.test')
        self.owner.must_change_password = False
        self.owner.set_password(NEW_PASSWORD)
        self.owner.save()
        self.sub = Company.objects.create(
            name='Depot', company_type='SUB', parent_company=self.root, owner=self.root, email='d@g.test', status='ACTIVE',
        )
        mail.outbox.clear()

    def login(self, email, password, expect=200):
        res = APIClient().post('/api/auth/login/', {'email': email, 'password': password}, format='json')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def test_only_super_admin(self):
        self.client.force_authenticate(self.owner)
        for url in ('/api/admin/summary/', '/api/admin/companies/', '/api/admin/users/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_summary_and_company_tree(self):
        summary = self.client.get('/api/admin/summary/').data
        self.assertEqual((summary['registered_companies'], summary['companies'], summary['users']), (1, 2, 1))

        rows = self.client.get('/api/admin/companies/').data
        self.assertEqual([r['name'] for r in rows], ['Green Agro', 'Depot'])
        self.assertEqual(rows[0]['admin_user']['email'], 'owner@greenagro.test')
        self.assertEqual(rows[0]['user_count'], 1)

    def test_create_user_and_reset_password(self):
        res = self.client.post('/api/admin/users/', {
            'email': 'clerk@greenagro.test', 'first_name': 'Meena', 'company': self.sub.id,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['user']['must_change_password'])
        self.assertIn(res.data['credentials']['password'], mail.outbox[-1].body)
        self.assertTrue(self.login('clerk@greenagro.test', res.data['credentials']['password'])['user']['must_change_password'])

        self.assertEqual(self.client.post('/api/admin/users/', {'email': 'x@x.test'}, format='json').status_code, 400)

        # Reset: old password stops working, old sessions are revoked, OTP change is forced again.
        session = self.login('owner@greenagro.test', NEW_PASSWORD)
        reset = self.client.post(f'/api/admin/users/{self.owner.id}/reset-password/')
        self.assertEqual(reset.status_code, 200, reset.data)
        self.login('owner@greenagro.test', NEW_PASSWORD, expect=401)
        self.assertEqual(
            APIClient().post('/api/auth/token/refresh/', {'refresh': session['refresh']}, format='json').status_code, 401
        )
        self.assertTrue(self.login('owner@greenagro.test', reset.data['credentials']['password'])['user']['must_change_password'])

    def test_deactivate_user_and_self_protection(self):
        res = self.client.patch(f'/api/admin/users/{self.owner.id}/', {'is_active': False}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.login('owner@greenagro.test', NEW_PASSWORD, expect=401)
        self.assertEqual(
            self.client.patch(f'/api/admin/users/{self.admin.id}/', {'is_active': False}, format='json').status_code, 400
        )

    def test_deactivating_registered_company_blocks_whole_group(self):
        sub_user = User.objects.create_user('s@g.test', 'Pass#12345', company=self.sub, must_change_password=False)
        token = self.login('s@g.test', 'Pass#12345')['access']

        res = self.client.post(f'/api/admin/companies/{self.root.id}/status/', {'status': 'INACTIVE'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        blocked = self.login('owner@greenagro.test', NEW_PASSWORD, expect=401)
        self.assertIn('inactive', str(blocked['detail']).lower())
        self.login('s@g.test', 'Pass#12345', expect=401)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(api.get('/api/auth/me/').status_code, 401)

        self.client.post(f'/api/admin/companies/{self.root.id}/status/', {'status': 'ACTIVE'}, format='json')
        self.login('owner@greenagro.test', NEW_PASSWORD)
        self.assertTrue(sub_user.is_active)

    def test_pending_registration_approval(self):
        APIClient().post('/api/auth/register/', {
            'company_name': 'Self Reg Co', 'email': 'self@reg.test', 'password': 'SelfReg#2026x',
        }, format='json')
        code = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
        APIClient().post('/api/auth/verify-otp/', {'email': 'self@reg.test', 'code': code}, format='json')
        self.login('self@reg.test', 'SelfReg#2026x', expect=401)

        pending = self.client.get('/api/auth/pending-registrations/').data
        self.assertEqual([p['email'] for p in pending], ['self@reg.test'])
        self.assertEqual(self.client.get('/api/admin/summary/').data['pending_approvals'], 1)

        user_id = pending[0]['id']
        self.assertEqual(self.client.post(f'/api/auth/approve/{user_id}/').status_code, 200)
        self.assertIn('approved', mail.outbox[-1].subject)
        self.login('self@reg.test', 'SelfReg#2026x')

    def test_pending_company_cannot_be_activated_directly(self):
        pending = Company.objects.create(name='Waiting Co', company_type='MAIN', email='w@w.test', status='PENDING')
        User.objects.create_user('w@w.test', 'Wait#12345', company=pending, is_active=False,
                                 email_verified=True, approval_status='PENDING')
        res = self.client.post(f'/api/admin/companies/{pending.id}/status/', {'status': 'ACTIVE'}, format='json')
        self.assertEqual(res.status_code, 400)
        rows = {r['name']: r for r in self.client.get('/api/admin/companies/').data}
        self.assertTrue(rows['Waiting Co']['awaiting_approval'])

        # A PENDING company with no registration waiting (older data) can simply be activated.
        legacy = Company.objects.create(name='Legacy Co', company_type='MAIN', email='l@l.test', status='PENDING')
        res = self.client.post(f'/api/admin/companies/{legacy.id}/status/', {'status': 'ACTIVE'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)


class SuperuserFlagTests(TestCase):
    def test_createsuperuser_makes_erp_super_admin(self):
        user = User.objects.create_superuser('boss@example.test', 'Boss#12345')
        self.assertTrue(user.is_super_admin)
        client = APIClient()
        client.force_authenticate(user)
        self.assertEqual(client.get('/api/admin/summary/').status_code, 200)


class SuperAdminAddCompanyTests(TestCase):
    def test_super_admin_adds_main_and_sub_into_existing_group(self):
        admin = User.objects.create_superuser('boss@example.test', 'Boss#12345')
        root = Company.objects.create(name='Green Agro', company_type='MAIN', email='g@g.test', status='ACTIVE')
        client = APIClient()
        client.force_authenticate(admin)

        main = client.post('/api/companies/', {
            'admin_email': 'login9@example.test',
            'name': 'Green Seeds', 'company_type': 'MAIN', 'group': root.id, 'email': 's@g.test',
        }, format='json')
        self.assertEqual(main.status_code, 201, main.data)
        self.assertEqual((main.data['owner'], main.data['status']), (root.id, 'ACTIVE'))

        sub = client.post('/api/companies/', {
            'admin_email': 'login10@example.test',
            'name': 'Seeds Depot', 'company_type': 'SUB', 'parent_company': main.data['id'], 'email': 'd@g.test',
        }, format='json')
        self.assertEqual(sub.status_code, 201, sub.data)
        self.assertEqual(sub.data['owner'], root.id)

        # A Main company cannot be the group of another Main.
        bad = client.post('/api/companies/', {
            'admin_email': 'login11@example.test',
            'name': 'X', 'company_type': 'MAIN', 'group': main.data['id'], 'email': 'x@g.test',
        }, format='json')
        self.assertEqual(bad.status_code, 400)

        # Editing still works (group is ignored on update).
        self.assertEqual(client.patch(f"/api/companies/{main.data['id']}/", {'phone': '123'}, format='json').status_code, 200)


class NoApprovalForAddedCompaniesTests(TestCase):
    def test_companies_added_by_a_company_are_active_immediately(self):
        root = Company.objects.create(name='Green Agro', company_type='MAIN', email='g@g.test', status='ACTIVE')
        owner = User.objects.create_user('o@g.test', 'Owner#12345', company=root, must_change_password=False)
        client = APIClient()
        client.force_authenticate(owner)
        main = client.post('/api/companies/', {
            'admin_email': 'login12@example.test',
            'name': 'Green Seeds', 'company_type': 'MAIN', 'email': 's@g.test', 'status': 'PENDING',
        }, format='json')
        sub = client.post('/api/companies/', {
            'admin_email': 'login13@example.test',
            'name': 'Depot', 'company_type': 'SUB', 'parent_company': main.data['id'], 'email': 'd@g.test',
        }, format='json')
        self.assertEqual((main.data['status'], sub.data['status']), ('ACTIVE', 'ACTIVE'))
        # Usable straight away elsewhere, e.g. for a warehouse.
        self.assertEqual(client.post('/api/warehouses/', {
            'company': sub.data['id'], 'name': 'Depot WH', 'code': 'D1',
        }, format='json').status_code, 201)


class SignInSiteTests(TestCase):
    def test_credentials_point_to_the_right_site(self):
        from django.conf import settings
        urls = settings.FRONTEND_LOGIN_URLS
        admin = User.objects.create_superuser('boss@example.test', 'Boss#12345')
        client = APIClient()
        client.force_authenticate(admin)

        reg = client.post('/api/companies/register/', {
            'name': 'Green Agro', 'email': 'g@g.test', 'admin_email': 'owner@g.test',
        }, format='json')
        self.assertEqual(reg.data['credentials']['login_url'], urls['company'])
        self.assertIn(urls['company'], mail.outbox[-1].body)

        root = Company.objects.get(pk=reg.data['company']['id'])
        sub = Company.objects.create(name='Depot', company_type='SUB', parent_company=root, owner=root, email='d@g.test', status='ACTIVE')
        made = client.post('/api/admin/users/', {'email': 'clerk@g.test', 'company': sub.id}, format='json')
        self.assertEqual(made.data['credentials']['login_url'], urls['company'])
        self.assertIn(urls['company'], mail.outbox[-1].body)

        me = APIClient()
        me.force_authenticate(admin)
        self.assertEqual(me.get('/api/auth/me/').data['company_level'], None)


class CompanyLoginOnCreateTests(TestCase):
    """Every Main / Sub company is created together with its own admin login."""

    def setUp(self):
        from django.conf import settings
        self.company_url = settings.FRONTEND_LOGIN_URLS['company']
        self.root = Company.objects.create(name='Green Agro', company_type='MAIN', email='g@g.test', status='ACTIVE')
        self.owner = User.objects.create_user('owner@g.test', 'Owner#12345', company=self.root, must_change_password=False)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_main_and_sub_get_logins(self):
        main = self.client.post('/api/companies/', {
            'name': 'Green Seeds', 'company_type': 'MAIN', 'email': 's@g.test',
            'admin_email': 'seeds.admin@g.test', 'admin_first_name': 'Meena',
        }, format='json')
        self.assertEqual(main.status_code, 201, main.data)
        creds = main.data['credentials']
        self.assertEqual((creds['username'], creds['login_url']), ('seeds.admin@g.test', self.company_url))
        self.assertTrue(main.data['email_sent'])
        self.assertIn(creds['password'], mail.outbox[-1].body)
        self.assertIn(self.company_url, mail.outbox[-1].body)
        seeds_admin = User.objects.get(email='seeds.admin@g.test')
        self.assertEqual(seeds_admin.company_id, main.data['id'])
        self.assertTrue(seeds_admin.must_change_password)

        sub = self.client.post('/api/companies/', {
            'name': 'Seeds Depot', 'company_type': 'SUB', 'parent_company': main.data['id'], 'email': 'd@g.test',
            'admin_email': 'depot.admin@g.test', 'admin_password': 'Depot#Pass2026',
        }, format='json')
        self.assertEqual(sub.status_code, 201, sub.data)
        self.assertEqual(sub.data['credentials']['password'], 'Depot#Pass2026')
        self.assertTrue(User.objects.get(email='depot.admin@g.test').check_password('Depot#Pass2026'))

    def test_login_is_required_and_validated(self):
        base = {'name': 'X', 'company_type': 'MAIN', 'email': 'x@g.test'}
        self.assertIn('admin_email', self.client.post('/api/companies/', base, format='json').data)
        dup = self.client.post('/api/companies/', {**base, 'admin_email': 'owner@g.test'}, format='json')
        self.assertIn('admin_email', dup.data)
        weak = self.client.post('/api/companies/', {**base, 'admin_email': 'new@g.test', 'admin_password': '123'}, format='json')
        self.assertIn('admin_password', weak.data)
        self.assertFalse(Company.objects.filter(name='X').exists())

    def test_editing_a_company_needs_no_login(self):
        res = self.client.patch(f'/api/companies/{self.root.id}/', {'phone': '9000000000'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
