import { useCallback, useEffect, useState } from 'react'
import useMasterData from '../hooks/useMasterData'
import DocumentForm from '../components/DocumentForm'
import DocumentView from '../components/DocumentView'
import StatusBadge from '../components/StatusBadge'
import { lineFromSaved } from '../components/LineItemsEditor'
import {
  cancelSalesInvoice, createQuotation, createSalesInvoice, createSalesOrder, deleteQuotation, deleteSalesOrder,
  getQuotations, getSalesInvoices, getSalesOrders, quotationAction, salesOrderAction, updateQuotation, updateSalesOrder,
} from '../api/sales'
import { errorMessage, money, num, qty, shortDate, today } from '../utils/format'

const TABS = [
  { key: 'quotations', label: 'Quotations' },
  { key: 'orders', label: 'Sales Orders' },
  { key: 'invoices', label: 'Invoices' },
]

const STATUS_OPTIONS = {
  quotations: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED'],
  orders: ['DRAFT', 'CONFIRMED', 'PARTIALLY_INVOICED', 'INVOICED', 'CANCELLED'],
  invoices: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'],
}

const QUOTATION_FIELDS = [{ name: 'valid_until', label: 'Valid until', type: 'date' }]
const ORDER_FIELDS = [
  { name: 'warehouse', label: 'Dispatch warehouse', type: 'warehouse' },
  { name: 'expected_delivery_date', label: 'Delivery date', type: 'date' },
]
const INVOICE_FIELDS = [
  { name: 'warehouse', label: 'Dispatch from warehouse', type: 'warehouse', required: true },
  { name: 'due_date', label: 'Payment due date', type: 'date' },
]

const FORM_CONFIG = {
  quotation: { title: 'Quotation', fields: QUOTATION_FIELDS, create: createQuotation, update: updateQuotation },
  order: { title: 'Sales Order', fields: ORDER_FIELDS, create: createSalesOrder, update: updateSalesOrder },
  invoice: { title: 'Invoice', fields: INVOICE_FIELDS, create: createSalesInvoice },
}

const headerFrom = (doc, extra = {}) => ({
  company: doc.company, branch: doc.branch || '', party: doc.customer, date: today(), notes: doc.notes || '', ...extra,
})

const openInvoicePrint = (id) => window.open(`/sales/invoices/${id}/print`, '_blank')

export default function Sales() {
  const master = useMasterData()
  const [tab, setTab] = useState('invoices')
  const [quotations, setQuotations] = useState([])
  const [orders, setOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState(null) // { kind: 'quotation' | 'order' | 'invoice', initial, editId?, lockParty? }
  const [view, setView] = useState(null) // { kind, doc }

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([getQuotations(), getSalesOrders(), getSalesInvoices()])
      .then(([qt, so, inv]) => {
        setQuotations(qt.data)
        setOrders(so.data)
        setInvoices(inv.data)
      })
      .catch(() => setError('Failed to load sales.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  const run = async (fn, confirmText, after) => {
    if (confirmText && !window.confirm(confirmText)) return
    try {
      const res = await fn()
      setView(null)
      reload()
      after?.(res)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const saved = (res, kind) => {
    setForm(null)
    setView(null)
    reload()
    if (kind === 'invoice' && res?.data?.id && window.confirm(`Invoice ${res.data.number} saved. Print it now?`)) {
      openInvoicePrint(res.data.id)
    }
  }

  const edit = (kind, doc) => setForm({
    kind,
    editId: doc.id,
    initial: {
      header: headerFrom(doc, {
        date: doc.date,
        ...(kind === 'quotation' ? { valid_until: doc.valid_until || '' } : {}),
        ...(kind === 'order' ? { warehouse: doc.warehouse || '', expected_delivery_date: doc.expected_delivery_date || '' } : {}),
      }),
      lines: doc.items.map((i) => lineFromSaved(i)),
    },
  })

  const invoiceFromOrder = (so) => setForm({
    kind: 'invoice',
    lockParty: true,
    initial: {
      header: headerFrom(so, { warehouse: so.warehouse || '' }),
      links: { sales_order: so.id },
      lines: so.items.filter((i) => num(i.pending_quantity) > 0).map((i) => lineFromSaved(i, {
        quantity: i.pending_quantity, order_item: i.id, max_quantity: num(i.pending_quantity),
      })),
    },
  })

  const q = search.toLowerCase()
  const filtered = (list) => list.filter((d) => (!statusFilter || d.status === statusFilter)
    && (!q || d.number.toLowerCase().includes(q) || (d.customer_name || '').toLowerCase().includes(q)))

  const monthStart = today().slice(0, 8) + '01'
  const activeInvoices = invoices.filter((i) => i.status !== 'CANCELLED')
  const salesThisMonth = activeInvoices.filter((i) => i.date >= monthStart).reduce((s, i) => s + num(i.grand_total), 0)
  const receivable = activeInvoices.reduce((s, i) => s + num(i.balance_due), 0)
  const openOrders = orders.filter((o) => ['CONFIRMED', 'PARTIALLY_INVOICED'].includes(o.status)).length

  const config = form && FORM_CONFIG[form.kind]

  return (
    <div className="container mt-4">
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="stat-card bg-indigo">
            <div className="stat-icon">📈</div>
            <div className="stat-label">Sales this month</div>
            <div className="stat-value stat-value-money">{loading ? '…' : money(salesThisMonth)}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-teal">
            <div className="stat-icon">📦</div>
            <div className="stat-label">Orders to invoice</div>
            <div className="stat-value">{loading ? '…' : openOrders}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-orange">
            <div className="stat-icon">💰</div>
            <div className="stat-label">Receivable from customers</div>
            <div className="stat-value stat-value-money">{loading ? '…' : money(receivable)}</div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h2 className="mb-0">Sales</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary" onClick={() => setForm({ kind: 'quotation', initial: {} })}>+ Quotation</button>
          <button className="btn btn-outline-primary" onClick={() => setForm({ kind: 'order', initial: {} })}>+ Sales Order</button>
          <button className="btn btn-primary" onClick={() => setForm({ kind: 'invoice', initial: {} })}>+ Invoice</button>
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
        <input className="form-control" style={{ maxWidth: 280 }} placeholder="Search number or customer…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-select" style={{ maxWidth: 220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS[tab].map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
        </select>
      </div>

      {(error || master.error) && <div className="alert alert-danger">{error || master.error}</div>}
      {loading || master.loading ? <p>Loading...</p> : (
        <div className="table-responsive">
          {tab === 'quotations' && (
            <table className="table table-striped">
              <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Valid until</th><th className="text-end">Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered(quotations).map((d) => (
                  <tr key={d.id}>
                    <td className="fw-semibold">{d.number}</td><td>{shortDate(d.date)}</td><td>{d.customer_name}</td>
                    <td>{shortDate(d.valid_until)}</td><td className="text-end">{money(d.grand_total)}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setView({ kind: 'quotation', doc: d })}>View</button></td>
                  </tr>
                ))}
                {filtered(quotations).length === 0 && <tr><td colSpan="7" className="text-center text-muted">No quotations.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'orders' && (
            <table className="table table-striped">
              <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Delivery</th><th className="text-end">Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered(orders).map((d) => (
                  <tr key={d.id}>
                    <td className="fw-semibold">{d.number}</td><td>{shortDate(d.date)}</td><td>{d.customer_name}</td>
                    <td>{shortDate(d.expected_delivery_date)}</td><td className="text-end">{money(d.grand_total)}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setView({ kind: 'order', doc: d })}>View</button></td>
                  </tr>
                ))}
                {filtered(orders).length === 0 && <tr><td colSpan="7" className="text-center text-muted">No sales orders.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'invoices' && (
            <table className="table table-striped">
              <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th>Due</th><th className="text-end">Total</th><th className="text-end">Balance</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered(invoices).map((d) => (
                  <tr key={d.id}>
                    <td className="fw-semibold">{d.number}</td><td>{shortDate(d.date)}</td><td>{d.customer_name}</td>
                    <td>{shortDate(d.due_date)}</td><td className="text-end">{money(d.grand_total)}</td>
                    <td className="text-end">{money(d.balance_due)}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td className="text-end text-nowrap">
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openInvoicePrint(d.id)}>Print</button>
                      <button className="btn btn-sm btn-outline-primary" onClick={() => setView({ kind: 'invoice', doc: d })}>View</button>
                    </td>
                  </tr>
                ))}
                {filtered(invoices).length === 0 && <tr><td colSpan="8" className="text-center text-muted">No invoices.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ----- views ----- */}

      {!form && view?.kind === 'quotation' && (
        <DocumentView
          doc={view.doc} title={`Quotation ${view.doc.number}`} partyName={view.doc.customer_name}
          onClose={() => setView(null)}
          details={[{ label: 'Company', value: view.doc.company_name }, { label: 'Valid until', value: shortDate(view.doc.valid_until) }]}
          actions={<QuotationActions doc={view.doc} run={run} onEdit={(d) => edit('quotation', d)}
            onConverted={() => setTab('orders')} />}
        />
      )}

      {!form && view?.kind === 'order' && (
        <DocumentView
          doc={view.doc} title={`Sales Order ${view.doc.number}`} partyName={view.doc.customer_name}
          onClose={() => setView(null)}
          details={[
            { label: 'Company', value: view.doc.company_name },
            { label: 'From quotation', value: view.doc.quotation_number },
            { label: 'Warehouse', value: master.warehouseById[view.doc.warehouse]?.name },
            { label: 'Delivery date', value: shortDate(view.doc.expected_delivery_date) },
          ]}
          extraColumns={[{ label: 'Invoiced', render: (l) => qty(l.invoiced_quantity) }]}
          actions={
            <>
              {view.doc.status === 'DRAFT' && (
                <>
                  <button className="btn btn-outline-danger" onClick={() => run(() => deleteSalesOrder(view.doc.id), `Delete draft ${view.doc.number}?`)}>Delete</button>
                  <button className="btn btn-outline-primary" onClick={() => edit('order', view.doc)}>Edit</button>
                  <button className="btn btn-success" onClick={() => run(() => salesOrderAction(view.doc.id, 'confirm'))}>Confirm order</button>
                </>
              )}
              {view.doc.status === 'CONFIRMED' && (
                <button className="btn btn-outline-danger" onClick={() => run(() => salesOrderAction(view.doc.id, 'cancel'), `Cancel ${view.doc.number}?`)}>Cancel order</button>
              )}
              {['CONFIRMED', 'PARTIALLY_INVOICED'].includes(view.doc.status) && (
                <button className="btn btn-success" onClick={() => invoiceFromOrder(view.doc)}>Create invoice</button>
              )}
            </>
          }
        />
      )}

      {!form && view?.kind === 'invoice' && (
        <DocumentView
          doc={view.doc} title={`Invoice ${view.doc.number}`} partyName={view.doc.customer_name}
          onClose={() => setView(null)}
          details={[
            { label: 'Company', value: view.doc.company_name },
            { label: 'Sales order', value: view.doc.sales_order_number },
            { label: 'Warehouse', value: view.doc.warehouse_name },
            { label: 'Due date', value: shortDate(view.doc.due_date) },
            { label: 'Place of supply', value: view.doc.place_of_supply },
            { label: 'Received', value: money(view.doc.amount_paid) },
            { label: 'Balance due', value: money(view.doc.balance_due) },
          ]}
          actions={
            <>
              {view.doc.status !== 'CANCELLED' && (
                <button className="btn btn-outline-danger" onClick={() => run(() => cancelSalesInvoice(view.doc.id),
                  `Cancel ${view.doc.number}? Its goods will be returned to stock.`)}>Cancel invoice</button>
              )}
              <button className="btn btn-success" onClick={() => openInvoicePrint(view.doc.id)}>Print</button>
            </>
          }
        />
      )}

      {/* ----- form ----- */}

      {config && (
        <DocumentForm
          title={`${form.editId ? 'Edit' : 'New'} ${config.title}`} partyType="customer" priceField="selling_price"
          extraFields={config.fields} master={master} initial={form.initial} lockParty={form.lockParty}
          submitLabel={form.kind === 'invoice' ? 'Save Invoice' : form.editId ? 'Save Changes' : 'Save as Draft'}
          onClose={() => setForm(null)}
          onSubmit={async (payload) => {
            const res = await (form.editId ? config.update(form.editId, payload) : config.create(payload))
            saved(res, form.kind)
          }}
        />
      )}
    </div>
  )
}

function QuotationActions({ doc, run, onEdit, onConverted }) {
  const open = ['DRAFT', 'SENT'].includes(doc.status)
  return (
    <>
      {['DRAFT', 'SENT', 'REJECTED'].includes(doc.status) && (
        <button className="btn btn-outline-danger" onClick={() => run(() => deleteQuotation(doc.id), `Delete ${doc.number}?`)}>Delete</button>
      )}
      {open && <button className="btn btn-outline-primary" onClick={() => onEdit(doc)}>Edit</button>}
      {doc.status === 'DRAFT' && <button className="btn btn-outline-primary" onClick={() => run(() => quotationAction(doc.id, 'send'))}>Mark sent</button>}
      {open && <button className="btn btn-outline-secondary" onClick={() => run(() => quotationAction(doc.id, 'reject'))}>Rejected</button>}
      {open && <button className="btn btn-outline-success" onClick={() => run(() => quotationAction(doc.id, 'accept'))}>Accepted</button>}
      {['DRAFT', 'SENT', 'ACCEPTED'].includes(doc.status) && (
        <button className="btn btn-success" onClick={() => run(() => quotationAction(doc.id, 'convert'), null, (res) => {
          alert(`Sales order ${res.data.number} created as a draft.`)
          onConverted()
        })}>Convert to order</button>
      )}
    </>
  )
}
