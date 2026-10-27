"""
End-to-end tests for the purchase → stock → sales → payment → reports flow.
Run with:  python manage.py test common
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from companies.models import Company
from customers.models import Customer
from masters.models import GSTMaster, Warehouse
from products.models import Product
from stock.models import Stock
from suppliers.models import Supplier


def D(value):
    return Decimal(str(value))


class ERPFlowTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name='Agro Co', company_type='MAIN', email='a@example.com', state='TN', status='ACTIVE'
        )
        self.other_company = Company.objects.create(
            name='Other Co', company_type='MAIN', email='o@example.com', state='TN', status='ACTIVE'
        )
        self.user = User.objects.create_user('user@example.com', 'pass12345', company=self.company)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.warehouse = Warehouse.objects.create(company=self.company, name='Main', code='WH1')
        self.gst = GSTMaster.objects.create(company=self.company, name='GST 18%', percentage=18)
        self.product = Product.objects.create(
            company=self.company, code='FERT-1', name='Fertilizer', hsn_code='3105',
            purchase_price=100, selling_price=150, gst_master=self.gst, minimum_quantity=5,
        )
        self.service = Product.objects.create(
            company=self.company, code='SVC-1', name='Soil Testing', product_type='SERVICE', selling_price=500,
        )
        self.supplier = Supplier.objects.create(company=self.company, name='Seed Supplier', code='S1', state='TN')
        self.local_customer = Customer.objects.create(company=self.company, name='Local Farmer', code='C1', state='TN')
        self.interstate_customer = Customer.objects.create(company=self.company, name='KA Farmer', code='C2', state='KA')

    def post(self, url, data, expect=201):
        res = self.client.post(url, data, format='json')
        self.assertEqual(res.status_code, expect, res.data)
        return res.data

    def stock_qty(self):
        s = Stock.objects.filter(product=self.product, warehouse=self.warehouse).first()
        return s.quantity if s else D(0)

    def line(self, product=None, qty=10, rate=100, gst=18, **extra):
        return {'product': (product or self.product).id, 'quantity': qty, 'rate': rate, 'gst_percent': gst, **extra}

    # ---------- purchases ----------

    def test_purchase_order_receipt_and_bill(self):
        po = self.post('/api/purchase-orders/', {
            'company': self.company.id, 'supplier': self.supplier.id, 'warehouse': self.warehouse.id,
            'items': [self.line(qty=10, rate=100, discount_percent=10)],
        })
        self.assertEqual(po['number'], 'PO-00001')
        self.assertEqual(po['status'], 'DRAFT')
        # 10 x 100 - 10% = 900 taxable, 18% = 162 split CGST/SGST (same state)
        self.assertEqual(D(po['taxable_amount']), D(900))
        self.assertEqual(D(po['cgst_amount']), D(81))
        self.assertEqual(D(po['igst_amount']), D(0))
        self.assertEqual(D(po['grand_total']), D(1062))

        # Cannot receive against a draft order.
        grn_payload = {
            'company': self.company.id, 'supplier': self.supplier.id, 'warehouse': self.warehouse.id,
            'purchase_order': po['id'],
            'items': [{'product': self.product.id, 'order_item': po['items'][0]['id'], 'quantity': 4}],
        }
        self.post('/api/goods-receipts/', grn_payload, expect=400)

        self.post(f"/api/purchase-orders/{po['id']}/approve/", {}, expect=200)
        grn = self.post('/api/goods-receipts/', grn_payload)
        self.assertEqual(grn['number'], 'GRN-00001')
        self.assertEqual(self.stock_qty(), D(4))
        po = self.client.get(f"/api/purchase-orders/{po['id']}/").data
        self.assertEqual(po['status'], 'PARTIALLY_RECEIVED')
        self.assertEqual(D(po['items'][0]['received_quantity']), D(4))

        # Over-receiving is blocked and rolls back completely.
        over = dict(grn_payload, items=[{'product': self.product.id, 'order_item': po['items'][0]['id'], 'quantity': 7}])
        self.post('/api/goods-receipts/', over, expect=400)
        self.assertEqual(self.stock_qty(), D(4))

        rest = dict(grn_payload, items=[{'product': self.product.id, 'order_item': po['items'][0]['id'], 'quantity': 6}])
        self.post('/api/goods-receipts/', rest)
        self.assertEqual(self.stock_qty(), D(10))
        self.assertEqual(self.client.get(f"/api/purchase-orders/{po['id']}/").data['status'], 'RECEIVED')

        bill = self.post('/api/purchase-bills/', {
            'company': self.company.id, 'supplier': self.supplier.id, 'supplier_invoice_number': 'S-55',
            'purchase_order': po['id'], 'goods_receipt': grn['id'],
            'items': [self.line(qty=4, rate=100)],
        })
        self.assertEqual(bill['status'], 'UNPAID')
        self.assertEqual(self.stock_qty(), D(10))  # GRN already added the stock

        # Same supplier invoice number cannot be entered twice.
        self.post('/api/purchase-bills/', {
            'company': self.company.id, 'supplier': self.supplier.id, 'supplier_invoice_number': 's-55',
            'items': [self.line(qty=1)],
        }, expect=400)

        # GRN linked to an active bill cannot be cancelled.
        self.post(f"/api/goods-receipts/{grn['id']}/cancel/", {}, expect=400)

    def test_direct_purchase_bill_updates_stock_and_cancels(self):
        bill = self.post('/api/purchase-bills/', {
            'company': self.company.id, 'supplier': self.supplier.id, 'supplier_invoice_number': 'D-1',
            'update_stock': True, 'warehouse': self.warehouse.id, 'items': [self.line(qty=20)],
        })
        self.assertEqual(self.stock_qty(), D(20))
        self.post(f"/api/purchase-bills/{bill['id']}/cancel/", {}, expect=200)
        self.assertEqual(self.stock_qty(), D(0))

    # ---------- sales ----------

    def _stock_up(self, qty=50):
        self.post('/api/stock/opening/', {
            'company': self.company.id, 'product': self.product.id, 'warehouse': self.warehouse.id, 'quantity': qty,
        })

    def test_quotation_to_order_to_invoice(self):
        self._stock_up(50)
        qt = self.post('/api/quotations/', {
            'company': self.company.id, 'customer': self.interstate_customer.id,
            'items': [self.line(qty=8, rate=150), self.line(product=self.service, qty=1, rate=500, gst=18)],
        })
        # Inter-state: all tax is IGST.
        self.assertTrue(qt['is_inter_state'])
        self.assertEqual(D(qt['igst_amount']), D('306.00'))  # (1200 + 500) * 18%
        self.assertEqual(D(qt['cgst_amount']), D(0))
        self.assertEqual(qt['items'][0]['hsn_code'], '3105')  # defaulted from product

        so = self.post(f"/api/quotations/{qt['id']}/convert/", {})
        self.assertEqual(so['status'], 'DRAFT')
        self.assertEqual(self.client.get(f"/api/quotations/{qt['id']}/").data['status'], 'CONVERTED')
        self.post(f"/api/sales-orders/{so['id']}/confirm/", {}, expect=200)

        inv = self.post('/api/sales-invoices/', {
            'company': self.company.id, 'customer': self.interstate_customer.id, 'warehouse': self.warehouse.id,
            'sales_order': so['id'],
            'items': [
                self.line(qty=5, rate=150, order_item=so['items'][0]['id']),
                self.line(product=self.service, qty=1, rate=500, order_item=so['items'][1]['id']),
            ],
        })
        self.assertEqual(inv['number'], 'INV-00001')
        self.assertEqual(self.stock_qty(), D(45))  # service line takes no stock
        self.assertEqual(self.client.get(f"/api/sales-orders/{so['id']}/").data['status'], 'PARTIALLY_INVOICED')

        printable = self.client.get(f"/api/sales-invoices/{inv['id']}/print_data/").data
        self.assertEqual(printable['buyer']['name'], 'KA Farmer')

        self.post(f"/api/sales-invoices/{inv['id']}/cancel/", {}, expect=200)
        self.assertEqual(self.stock_qty(), D(50))
        self.assertEqual(self.client.get(f"/api/sales-orders/{so['id']}/").data['status'], 'CONFIRMED')

    def test_invoice_blocks_insufficient_stock(self):
        self._stock_up(3)
        self.post('/api/sales-invoices/', {
            'company': self.company.id, 'customer': self.local_customer.id, 'warehouse': self.warehouse.id,
            'items': [self.line(qty=5)],
        }, expect=400)
        self.assertEqual(self.stock_qty(), D(3))
        self.assertFalse(self.client.get('/api/sales-invoices/').data)  # nothing half-saved

    def test_round_off(self):
        self._stock_up(10)
        inv = self.post('/api/sales-invoices/', {
            'company': self.company.id, 'customer': self.local_customer.id, 'warehouse': self.warehouse.id,
            'items': [self.line(qty=1, rate='99.99', gst=5)],  # 99.99 + 5.00 = 104.99
        })
        self.assertEqual(D(inv['grand_total']), D(105))
        self.assertEqual(D(inv['round_off']), D('0.01'))

    def test_cannot_use_other_company_records(self):
        other_wh = Warehouse.objects.create(company=self.other_company, name='X', code='X')
        self.post('/api/sales-invoices/', {
            'company': self.company.id, 'customer': self.local_customer.id, 'warehouse': other_wh.id,
            'items': [self.line(qty=1)],
        }, expect=400)
        self.post('/api/sales-invoices/', {
            'company': self.other_company.id, 'customer': self.local_customer.id, 'warehouse': other_wh.id,
            'items': [self.line(qty=1)],
        }, expect=400)

    # ---------- payments, ledger, outstanding ----------

    def test_receipts_ledger_and_outstanding(self):
        self._stock_up(50)
        inv1 = self.post('/api/sales-invoices/', {
            'company': self.company.id, 'customer': self.local_customer.id, 'warehouse': self.warehouse.id,
            'items': [self.line(qty=10, rate=100, gst=0)],
        })
        inv2 = self.post('/api/sales-invoices/', {
            'company': self.company.id, 'customer': self.local_customer.id, 'warehouse': self.warehouse.id,
            'items': [self.line(qty=5, rate=100, gst=0)],
        })
        # Over-allocating an invoice is rejected.
        self.post('/api/payments/', {
            'company': self.company.id, 'payment_type': 'RECEIPT', 'customer': self.local_customer.id,
            'amount': 2000, 'allocations': [{'sales_invoice': inv1['id'], 'amount': 1500}],
        }, expect=400)

        rcpt = self.post('/api/payments/', {
            'company': self.company.id, 'payment_type': 'RECEIPT', 'customer': self.local_customer.id,
            'amount': 1300, 'mode': 'UPI', 'reference': 'UTR1',
            'allocations': [
                {'sales_invoice': inv1['id'], 'amount': 1000},
                {'sales_invoice': inv2['id'], 'amount': 200},
            ],
        })
        self.assertEqual(rcpt['number'], 'RCPT-00001')
        self.assertEqual(D(rcpt['unallocated_amount']), D(100))
        self.assertEqual(self.client.get(f"/api/sales-invoices/{inv1['id']}/").data['status'], 'PAID')
        self.assertEqual(self.client.get(f"/api/sales-invoices/{inv2['id']}/").data['status'], 'PARTIALLY_PAID')

        # Paid invoices cannot be cancelled.
        self.post(f"/api/sales-invoices/{inv1['id']}/cancel/", {}, expect=400)

        ledger = self.client.get('/api/ledger/', {'party_type': 'customer', 'party': self.local_customer.id}).data
        self.assertEqual(len(ledger['entries']), 3)
        self.assertEqual(D(ledger['closing_balance']), D(200))  # 1500 billed - 1300 received

        out = self.client.get('/api/outstanding/', {'type': 'receivable'}).data
        self.assertEqual(len(out['documents']), 1)
        self.assertEqual(D(out['parties'][0]['total_due']), D(300))
        self.assertEqual(D(out['parties'][0]['advance']), D(100))
        self.assertEqual(D(out['parties'][0]['net_due']), D(200))

        self.post(f"/api/payments/{rcpt['id']}/cancel/", {}, expect=200)
        self.assertEqual(self.client.get(f"/api/sales-invoices/{inv1['id']}/").data['status'], 'UNPAID')

    def test_supplier_payment(self):
        bill = self.post('/api/purchase-bills/', {
            'company': self.company.id, 'supplier': self.supplier.id, 'supplier_invoice_number': 'B-1',
            'items': [self.line(qty=10, rate=100, gst=0)],
        })
        self.post('/api/payments/', {
            'company': self.company.id, 'payment_type': 'PAYMENT', 'customer': self.local_customer.id,
            'amount': 100,
        }, expect=400)
        self.post('/api/payments/', {
            'company': self.company.id, 'payment_type': 'PAYMENT', 'supplier': self.supplier.id,
            'amount': 1000, 'allocations': [{'purchase_bill': bill['id'], 'amount': 1000}],
        })
        self.assertEqual(self.client.get(f"/api/purchase-bills/{bill['id']}/").data['status'], 'PAID')
        ledger = self.client.get('/api/ledger/', {'party_type': 'supplier', 'party': self.supplier.id}).data
        self.assertEqual(D(ledger['closing_balance']), D(0))

    # ---------- reports ----------

    def test_reports(self):
        self.post('/api/purchase-bills/', {
            'company': self.company.id, 'supplier': self.supplier.id, 'supplier_invoice_number': 'R-1',
            'update_stock': True, 'warehouse': self.warehouse.id, 'items': [self.line(qty=20, rate=100, gst=18)],
        })
        self.post('/api/sales-invoices/', {
            'company': self.company.id, 'customer': self.local_customer.id, 'warehouse': self.warehouse.id,
            'items': [self.line(qty=17, rate=150, gst=18)],
        })
        gst = self.client.get('/api/reports/gst/').data
        self.assertEqual(D(gst['outward_total']['total_tax']), D(459))   # 2550 * 18%
        self.assertEqual(D(gst['inward_total']['total_tax']), D(360))    # 2000 * 18%
        self.assertEqual(D(gst['net_payable']['total_tax']), D(99))
        self.assertEqual(gst['hsn_summary'][0]['hsn_code'], '3105')

        stock = self.client.get('/api/reports/stock/').data
        self.assertEqual(D(stock['total_value']), D(300))  # 3 left x 100
        self.assertEqual(len(stock['low_stock']), 1)       # 3 < minimum 5

        sales = self.client.get('/api/reports/sales/').data
        self.assertEqual(sales['totals']['count'], 1)
        self.assertEqual(D(sales['by_product'][0]['quantity']), D(17))

        dash = self.client.get('/api/reports/dashboard/').data
        self.assertEqual(D(dash['sales_this_month']), D(3009))
        self.assertEqual(D(dash['receivables']), D(3009))
        self.assertEqual(D(dash['payables']), D(2360))
        self.assertEqual(len(dash['trend']), 6)
        self.assertEqual(dash['low_stock_count'], 1)
