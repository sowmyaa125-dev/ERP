import { useCallback, useEffect, useState } from 'react'
import useMasterData from '../hooks/useMasterData'
import DocumentForm from '../components/DocumentForm'
import DocumentView from '../components/DocumentView'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { lineFromSaved, pricingFor } from '../components/LineItemsEditor'
import {
  approvePurchaseOrder, cancelGoodsReceipt, cancelPurchaseBill, cancelPurchaseOrder,
  createGoodsReceipt, createPurchaseBill, createPurchaseOrder, deletePurchaseOrder,
  getGoodsReceipts, getPurchaseBills, getPurchaseOrders, updatePurchaseOrder,
} from '../api/purchases'
import { errorMessage, money, num, qty, shortDate, today } from '../utils/format'

const TABS = [
  { key: 'orders', label: 'Purchase Orders' },
  { key: 'receipts', label: 'Goods Receipts' },
  { key: 'bills', label: 'Purchase Bills' },
]

const PO_FIELDS = [
  { name: 'warehouse', label: 'Deliver to warehouse', type: 'warehouse' },
  { name: 'expected_date', label: 'Expected date', type: 'date' },
]
const BILL_FIELDS = [
  { name: 'supplier_invoice_number', label: 'Supplier invoice no.', type: 'text', required: true },
  { name: 'due_date', label: 'Due date', type: 'date' },
  { name: 'update_stock', label: 'Add these items to stock (no goods receipt)', type: 'checkbox' },
  { name: 'warehouse', label: 'Warehouse', type: 'warehouse', required: true, showIf: (h) => h.update_stock },
]

const headerFrom = (doc) => ({
  company: doc.company, branch: doc.branch || '', party: doc.supplier, date: today(), notes: doc.notes || '',
})

export default function Purchases() {
  const master = useMasterData()
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [receipts, setReceipts] = useState([])
  const [bills, setBills] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState(null) // { kind: 'po' | 'bill' | 'grn', initial, editId?, lockParty? }
  const [view, setView] = useState(null) // { kind, doc }

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([getPurchaseOrders(), getGoodsReceipts(), getPurchaseBills()])
      .then(([po, grn, pb]) => {
        setOrders(po.data)
        setReceipts(grn.data)
        setBills(pb.data)
      })
      .catch(() => setError('Failed to load purchases.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  const run = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    try {
      await fn()
      setView(null)
      reload()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const saved = () => {
    setForm(null)
    setView(null)
    reload()
  }

  // ----- builders for documents created from other documents -----

  const receiveFromOrder = (po) => setForm({
    kind: 'grn',
    lockParty: true,
    initial: {
      header: { ...headerFrom(po), warehouse: po.warehouse || '', supplier_reference: '' },
      links: { purchase_order: po.id },
      lines: po.items.filter((i) => num(i.pending_quantity) > 0).map((i) => ({
        key: `g${i.id}`, product: i.product, product_name: i.product_name, unit_name: i.unit_name,
        quantity: i.pending_quantity, order_item: i.id, max_quantity: num(i.pending_quantity),
      })),
    },
  })

  const billFromOrder = (po) => setForm({
    kind: 'bill',
    lockParty: true,
    initial: {
      header: headerFrom(po),
      links: { purchase_order: po.id },
      lines: po.items.map((i) => lineFromSaved(i)),
    },
  })

  const billFromReceipt = (grn) => {
    const po = orders.find((o) => o.id === grn.purchase_order)
    const lines = grn.items.map((gi) => {
      const poLine = po?.items.find((pi) => pi.id === gi.order_item)
      if (poLine) return lineFromSaved(poLine, { quantity: gi.quantity })
      const product = master.productById[gi.product]
      return lineFromSaved(
        { product: gi.product, quantity: gi.quantity, discount_percent: 0, ...pricingFor(product, 'purchase_price', master.gstRateById) },
      )
    })
    setForm({
      kind: 'bill',
      lockParty: true,
      initial: {
        header: headerFrom(grn),
        links: { goods_receipt: grn.id, purchase_order: grn.purchase_order || null },
        lines,
      },
    })
  }

  const editOrder = (po) => setForm({
    kind: 'po',
    editId: po.id,
    initial: {
      header: { ...headerFrom(po), date: po.date, warehouse: po.warehouse || '', expected_date: po.expected_date || '' },
      lines: po.items.map((i) => lineFromSaved(i)),
    },
  })

  // ----- lists -----

  const q = search.toLowerCase()
  const matches = (d) => !q || d.number.toLowerCase().includes(q) || (d.supplier_name || '').toLowerCase().includes(q)
    || (d.supplier_invoice_number || '').toLowerCase().includes(q)
  const filtered = (list) => list.filter((d) => (!statusFilter || d.status === statusFilter) && matches(d))

  const statusOptions = {
    orders: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    receipts: ['RECEIVED', 'CANCELLED'],
    bills: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  }[tab]

  const openBills = bills.filter((b) => b.status !== 'CANCELLED')
  const payable = openBills.reduce((s, b) => s + num(b.balance_due), 0)
  const pendingOrders = orders.filter((o) => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(o.status)).length

  return (
    <div className="container mt-4">
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="stat-card bg-indigo">
            <div className="stat-icon">🧾</div>
            <div className="stat-label">Orders awaiting goods</div>
            <div className="stat-value">{loading ? '…' : pendingOrders}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-teal">
            <div className="stat-icon">📥</div>
            <div className="stat-label">Bills entered</div>
            <div className="stat-value">{loading ? '…' : openBills.length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-orange">
            <div className="stat-icon">💸</div>
            <div className="stat-label">Payable to suppliers</div>
            <div className="stat-value stat-value-money">{loading ? '…' : money(payable)}</div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h2 className="mb-0">Purchases</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary" onClick={() => setForm({ kind: 'grn', initial: {} })}>+ Goods Receipt</button>
          <button className="btn btn-outline-primary" onClick={() => setForm({ kind: 'bill', initial: {} })}>+ Purchase Bill</button>
          <button className="btn btn-primary" onClick={() => setForm({ kind: 'po', initial: {} })}>+ Purchase Order</button>
        </div>
      </div>

      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => { setTab(t.key); setStatusFilter('') }}>
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        <input className="form-control" style={{ maxWidth: 280 }} placeholder="Search number or supplier…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-select" style={{ maxWidth: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
        </select>
      </div>

      {(error || master.error) && <div className="alert alert-danger">{error || master.error}</div>}
      {loading || master.loading ? <p>Loading...</p> : (
        <div className="table-responsive">
          {tab === 'orders' && (
            <table className="table table-striped">
              <thead><tr><th>Number</th><th>Date</th><th>Supplier</th><th>Expected</th><th className="text-end">Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered(orders).map((o) => (
                  <tr key={o.id}>
                    <td className="fw-semibold">{o.number}</td><td>{shortDate(o.date)}</td><td>{o.supplier_name}</td>
                    <td>{shortDate(o.expected_date)}</td><td className="text-end">{money(o.grand_total)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setView({ kind: 'po', doc: o })}>View</button></td>
                  </tr>
                ))}
                {filtered(orders).length === 0 && <tr><td colSpan="7" className="text-center text-muted">No purchase orders.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'receipts' && (
            <table className="table table-striped">
              <thead><tr><th>Number</th><th>Date</th><th>Supplier</th><th>Warehouse</th><th>PO</th><th>Challan</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered(receipts).map((g) => (
                  <tr key={g.id}>
                    <td className="fw-semibold">{g.number}</td><td>{shortDate(g.date)}</td><td>{g.supplier_name}</td>
                    <td>{g.warehouse_name}</td><td>{g.purchase_order_number || '—'}</td><td>{g.supplier_reference}</td>
                    <td><StatusBadge status={g.status} /></td>
                    <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setView({ kind: 'grn', doc: g })}>View</button></td>
                  </tr>
                ))}
                {filtered(receipts).length === 0 && <tr><td colSpan="8" className="text-center text-muted">No goods receipts.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'bills' && (
            <table className="table table-striped">
              <thead><tr><th>Number</th><th>Supplier inv.</th><th>Date</th><th>Due</th><th>Supplier</th><th className="text-end">Total</th><th className="text-end">Balance</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered(bills).map((b) => (
                  <tr key={b.id}>
                    <td className="fw-semibold">{b.number}</td><td>{b.supplier_invoice_number}</td><td>{shortDate(b.date)}</td>
                    <td>{shortDate(b.due_date)}</td><td>{b.supplier_name}</td>
                    <td className="text-end">{money(b.grand_total)}</td><td className="text-end">{money(b.balance_due)}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setView({ kind: 'bill', doc: b })}>View</button></td>
                  </tr>
                ))}
                {filtered(bills).length === 0 && <tr><td colSpan="9" className="text-center text-muted">No purchase bills.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ----- views ----- */}

      {!form && view?.kind === 'po' && (
        <DocumentView
          doc={view.doc} title={`Purchase Order ${view.doc.number}`} partyName={view.doc.supplier_name}
          onClose={() => setView(null)}
          details={[
            { label: 'Company', value: view.doc.company_name },
            { label: 'Warehouse', value: master.warehouseById[view.doc.warehouse]?.name },
            { label: 'Expected', value: shortDate(view.doc.expected_date) },
          ]}
          extraColumns={[{ label: 'Received', render: (l) => qty(l.received_quantity) }]}
          actions={<PoActions po={view.doc} run={run} onEdit={editOrder} onReceive={receiveFromOrder} onBill={billFromOrder} />}
        />
      )}

      {!form && view?.kind === 'grn' && (
        <ReceiptView grn={view.doc} onClose={() => setView(null)}
          actions={view.doc.status === 'RECEIVED' && (
            <>
              <button className="btn btn-outline-danger" onClick={() => run(() => cancelGoodsReceipt(view.doc.id),
                `Cancel ${view.doc.number}? Its stock will be removed again.`)}>Cancel receipt</button>
              <button className="btn btn-success" onClick={() => billFromReceipt(view.doc)}>Create bill</button>
            </>
          )}
        />
      )}

      {!form && view?.kind === 'bill' && (
        <DocumentView
          doc={view.doc} title={`Purchase Bill ${view.doc.number}`} partyName={view.doc.supplier_name}
          onClose={() => setView(null)}
          details={[
            { label: 'Supplier invoice', value: view.doc.supplier_invoice_number },
            { label: 'Due date', value: shortDate(view.doc.due_date) },
            { label: 'Paid', value: money(view.doc.amount_paid) },
            { label: 'Balance due', value: money(view.doc.balance_due) },
            { label: 'Stock', value: view.doc.update_stock ? `Added to ${master.warehouseById[view.doc.warehouse]?.name}` : (view.doc.goods_receipt ? 'Via goods receipt' : 'Not stocked') },
          ]}
          actions={view.doc.status !== 'CANCELLED' && (
            <button className="btn btn-outline-danger" onClick={() => run(() => cancelPurchaseBill(view.doc.id),
              `Cancel ${view.doc.number}?${view.doc.update_stock ? ' Its stock will be removed again.' : ''}`)}>Cancel bill</button>
          )}
        />
      )}

      {/* ----- forms ----- */}

      {form?.kind === 'po' && (
        <DocumentForm
          title={form.editId ? 'Edit Purchase Order' : 'New Purchase Order'} partyType="supplier" priceField="purchase_price"
          extraFields={PO_FIELDS} master={master} initial={form.initial}
          submitLabel={form.editId ? 'Save Changes' : 'Save as Draft'}
          onClose={() => setForm(null)}
          onSubmit={async (payload) => {
            await (form.editId ? updatePurchaseOrder(form.editId, payload) : createPurchaseOrder(payload))
            saved()
          }}
        />
      )}

      {form?.kind === 'bill' && (
        <DocumentForm
          title="New Purchase Bill" partyType="supplier" priceField="purchase_price"
          extraFields={form.initial.links?.goods_receipt ? BILL_FIELDS.filter((f) => !['update_stock', 'warehouse'].includes(f.name)) : BILL_FIELDS}
          master={master} initial={form.initial} lockParty={form.lockParty} submitLabel="Save Bill"
          onClose={() => setForm(null)}
          onSubmit={async (payload) => {
            if (!payload.update_stock) payload.warehouse = null
            await createPurchaseBill(payload)
            saved()
          }}
        />
      )}

      {form?.kind === 'grn' && (
        <GoodsReceiptForm master={master} initial={form.initial} lockParty={form.lockParty}
          onClose={() => setForm(null)} onSaved={saved} />
      )}
    </div>
  )
}

function PoActions({ po, run, onEdit, onReceive, onBill }) {
  const canReceive = ['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)
  return (
    <>
      {po.status === 'DRAFT' && (
        <>
          <button className="btn btn-outline-danger" onClick={() => run(() => deletePurchaseOrder(po.id), `Delete draft ${po.number}?`)}>Delete</button>
          <button className="btn btn-outline-primary" onClick={() => onEdit(po)}>Edit</button>
          <button className="btn btn-success" onClick={() => run(() => approvePurchaseOrder(po.id))}>Approve</button>
        </>
      )}
      {po.status === 'APPROVED' && (
        <button className="btn btn-outline-danger" onClick={() => run(() => cancelPurchaseOrder(po.id), `Cancel ${po.number}?`)}>Cancel order</button>
      )}
      {canReceive && <button className="btn btn-success" onClick={() => onReceive(po)}>Receive goods</button>}
      {['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status) && (
        <button className="btn btn-outline-primary" onClick={() => onBill(po)}>Enter bill</button>
      )}
    </>
  )
}

function ReceiptView({ grn, onClose, actions }) {
  return (
    <Modal title={`Goods Receipt ${grn.number}`} onClose={onClose} footer={actions}>
      <div className="row g-3 mb-3">
        <div className="col-md-4"><div className="form-label">Date</div>{shortDate(grn.date)}</div>
        <div className="col-md-4"><div className="form-label">Supplier</div>{grn.supplier_name}</div>
        <div className="col-md-4"><div className="form-label">Status</div><StatusBadge status={grn.status} /></div>
        <div className="col-md-4"><div className="form-label">Warehouse</div>{grn.warehouse_name}</div>
        <div className="col-md-4"><div className="form-label">Purchase order</div>{grn.purchase_order_number || '—'}</div>
        <div className="col-md-4"><div className="form-label">Challan / LR</div>{grn.supplier_reference || '—'}</div>
      </div>
      <table className="table table-sm">
        <thead><tr><th>#</th><th>Product</th><th className="text-end">Quantity</th></tr></thead>
        <tbody>
          {grn.items.map((l, i) => (
            <tr key={l.id}><td>{i + 1}</td><td>{l.product_name}</td><td className="text-end">{qty(l.quantity)} {l.unit_name || ''}</td></tr>
          ))}
        </tbody>
      </table>
      {grn.notes && <p className="text-muted small mb-0">{grn.notes}</p>}
    </Modal>
  )
}

let grnKey = 0

function GoodsReceiptForm({ master, initial, lockParty, onClose, onSaved }) {
  const [header, setHeader] = useState({
    company: '', branch: '', party: '', warehouse: '', date: today(), supplier_reference: '', notes: '', ...initial.header,
  })
  const [lines, setLines] = useState(initial.lines?.length ? initial.lines : [{ key: `n${++grnKey}`, product: '', quantity: '' }])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sameCompany = (x) => String(x.company) === String(header.company)
  const set = (name, value) => setHeader((h) => ({
    ...h, [name]: value, ...(name === 'company' ? { branch: '', party: '', warehouse: '' } : {}),
  }))
  const updateLine = (key, patch) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createGoodsReceipt({
        company: header.company, branch: header.branch || null, supplier: header.party, warehouse: header.warehouse,
        date: header.date, supplier_reference: header.supplier_reference, notes: header.notes,
        ...initial.links,
        items: lines.map((l) => ({ product: l.product, quantity: l.quantity, order_item: l.order_item || null })),
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Failed to save goods receipt.'))
      setSubmitting(false)
    }
  }

  const products = master.products.filter((p) => sameCompany(p) && p.product_type !== 'SERVICE')

  return (
    <Modal title="New Goods Receipt" size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <label className="form-label">Company *</label>
            <select className="form-select" value={header.company} required disabled={lockParty} onChange={(e) => set('company', e.target.value)}>
              <option value="">-- Select --</option>
              {master.companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Supplier *</label>
            <select className="form-select" value={header.party} required disabled={!header.company || lockParty} onChange={(e) => set('party', e.target.value)}>
              <option value="">-- Select --</option>
              {master.suppliers.filter(sameCompany).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Into warehouse *</label>
            <select className="form-select" value={header.warehouse} required disabled={!header.company} onChange={(e) => set('warehouse', e.target.value)}>
              <option value="">-- Select --</option>
              {master.warehouses.filter(sameCompany).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Branch</label>
            <select className="form-select" value={header.branch} disabled={!header.company} onChange={(e) => set('branch', e.target.value)}>
              <option value="">-- None --</option>
              {master.branches.filter(sameCompany).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Date *</label>
            <input type="date" className="form-control" value={header.date} required onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Challan / LR no.</label>
            <input className="form-control" value={header.supplier_reference} onChange={(e) => set('supplier_reference', e.target.value)} />
          </div>
        </div>

        <table className="table table-sm align-middle">
          <thead><tr><th>Product</th><th style={{ width: 180 }}>Quantity</th><th style={{ width: 40 }}></th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <select className="form-select form-select-sm" value={l.product} required disabled={Boolean(l.order_item)}
                    onChange={(e) => updateLine(l.key, { product: Number(e.target.value) || '' })}>
                    <option value="">-- Select product --</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                  </select>
                  {l.max_quantity != null && <div className="form-text">Pending on order: {l.max_quantity}</div>}
                </td>
                <td>
                  <input type="number" step="0.01" min="0.01" max={l.max_quantity ?? undefined} className="form-control form-control-sm"
                    required value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="btn btn-sm btn-outline-danger px-2" disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!initial.links?.purchase_order && (
          <button type="button" className="btn btn-sm btn-outline-primary"
            onClick={() => setLines([...lines, { key: `n${++grnKey}`, product: '', quantity: '' }])}>+ Add line</button>
        )}

        <div className="mt-3">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows="2" value={header.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <div className="d-flex justify-content-end gap-2 mt-3">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={submitting}>{submitting ? 'Saving...' : 'Receive into Stock'}</button>
        </div>
      </form>
    </Modal>
  )
}
