import { useCallback, useEffect, useState } from 'react'
import useMasterData from '../hooks/useMasterData'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import { cancelPayment, createPayment, getLedger, getOutstanding, getPayments } from '../api/payments'
import { getSalesInvoices } from '../api/sales'
import { getPurchaseBills } from '../api/purchases'
import { downloadCsv, errorMessage, money, num, shortDate, today } from '../utils/format'

const TABS = [
  { key: 'RECEIPT', label: 'Receipts' },
  { key: 'PAYMENT', label: 'Supplier Payments' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'ledger', label: 'Party Ledger' },
]
const MODES = [['CASH', 'Cash'], ['BANK', 'Bank transfer'], ['UPI', 'UPI'], ['CHEQUE', 'Cheque'], ['CARD', 'Card']]
const BUCKETS = [['current', 'Not due'], ['1_30', '1–30 days'], ['31_60', '31–60'], ['61_90', '61–90'], ['over_90', '90+']]

export default function Payments() {
  const master = useMasterData()
  const [tab, setTab] = useState('RECEIPT')
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null) // { type: 'RECEIPT' | 'PAYMENT', company?, party? }
  const [view, setView] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    getPayments()
      .then((res) => setPayments(res.data))
      .catch(() => setError('Failed to load payments.'))
      .finally(() => setLoading(false))
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  const handleCancel = async (p) => {
    if (!window.confirm(`Cancel ${p.number}? Linked invoices/bills will become unpaid again.`)) return
    try {
      await cancelPayment(p.id)
      setView(null)
      reload()
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const listed = payments.filter((p) => p.payment_type === tab)
  const active = (type) => payments.filter((p) => p.payment_type === type && p.status === 'ACTIVE')
  const monthStart = today().slice(0, 8) + '01'
  const sumMonth = (type) => active(type).filter((p) => p.date >= monthStart).reduce((s, p) => s + num(p.amount), 0)

  return (
    <div className="container mt-4">
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="stat-card bg-indigo">
            <div className="stat-icon">⬇️</div>
            <div className="stat-label">Received this month</div>
            <div className="stat-value stat-value-money">{loading ? '…' : money(sumMonth('RECEIPT'))}</div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="stat-card bg-orange">
            <div className="stat-icon">⬆️</div>
            <div className="stat-label">Paid this month</div>
            <div className="stat-value stat-value-money">{loading ? '…' : money(sumMonth('PAYMENT'))}</div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h2 className="mb-0">Payments</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary" onClick={() => setForm({ type: 'PAYMENT' })}>+ Pay Supplier</button>
          <button className="btn btn-primary" onClick={() => setForm({ type: 'RECEIPT' })}>+ Receive from Customer</button>
        </div>
      </div>

      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          </li>
        ))}
      </ul>

      {(error || master.error) && <div className="alert alert-danger">{error || master.error}</div>}

      {(tab === 'RECEIPT' || tab === 'PAYMENT') && (loading ? <p>Loading...</p> : (
        <div className="table-responsive">
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Number</th><th>Date</th><th>{tab === 'RECEIPT' ? 'Customer' : 'Supplier'}</th><th>Mode</th><th>Reference</th>
                <th className="text-end">Amount</th><th className="text-end">Advance</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {listed.map((p) => (
                <tr key={p.id}>
                  <td className="fw-semibold">{p.number}</td><td>{shortDate(p.date)}</td><td>{p.party_name}</td>
                  <td>{p.mode}</td><td>{p.reference}</td>
                  <td className="text-end">{money(p.amount)}</td>
                  <td className="text-end">{num(p.unallocated_amount) ? money(p.unallocated_amount) : '—'}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setView(p)}>View</button></td>
                </tr>
              ))}
              {listed.length === 0 && <tr><td colSpan="9" className="text-center text-muted">Nothing recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      ))}

      {tab === 'outstanding' && !master.loading && (
        <OutstandingTab master={master} reloadKey={reloadKey}
          onSettle={(type, company, party) => setForm({ type, company, party })} />
      )}

      {tab === 'ledger' && !master.loading && <LedgerTab master={master} reloadKey={reloadKey} />}

      {view && (
        <Modal title={`${view.payment_type === 'RECEIPT' ? 'Receipt' : 'Payment'} ${view.number}`} onClose={() => setView(null)}
          footer={view.status === 'ACTIVE' && <button className="btn btn-outline-danger" onClick={() => handleCancel(view)}>Cancel {view.payment_type === 'RECEIPT' ? 'receipt' : 'payment'}</button>}>
          <div className="row g-3 mb-3">
            <div className="col-md-4"><div className="form-label">Date</div>{shortDate(view.date)}</div>
            <div className="col-md-4"><div className="form-label">Party</div>{view.party_name}</div>
            <div className="col-md-4"><div className="form-label">Status</div><StatusBadge status={view.status} /></div>
            <div className="col-md-4"><div className="form-label">Amount</div><span className="fw-bold">{money(view.amount)}</span></div>
            <div className="col-md-4"><div className="form-label">Mode</div>{view.mode}</div>
            <div className="col-md-4"><div className="form-label">Reference</div>{view.reference || '—'}</div>
          </div>
          <table className="table table-sm">
            <thead><tr><th>Settled against</th><th className="text-end">Amount</th></tr></thead>
            <tbody>
              {view.allocations.map((a) => <tr key={a.id}><td>{a.document_number}</td><td className="text-end">{money(a.amount)}</td></tr>)}
              {num(view.unallocated_amount) > 0 && (
                <tr><td className="text-muted">Kept as advance (on account)</td><td className="text-end">{money(view.unallocated_amount)}</td></tr>
              )}
            </tbody>
          </table>
          {view.notes && <p className="text-muted small mb-0">{view.notes}</p>}
        </Modal>
      )}

      {form && (
        <PaymentForm master={master} type={form.type} initialCompany={form.company} initialParty={form.party}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />
      )}
    </div>
  )
}

function PaymentForm({ master, type, initialCompany, initialParty, onClose, onSaved }) {
  const isReceipt = type === 'RECEIPT'
  const partyField = isReceipt ? 'customer' : 'supplier'
  const docField = isReceipt ? 'sales_invoice' : 'purchase_bill'

  const [header, setHeader] = useState({
    company: initialCompany || '', branch: '', party: initialParty || '', date: today(),
    amount: '', mode: 'CASH', reference: '', notes: '',
  })
  const [openDocs, setOpenDocs] = useState([])
  const [alloc, setAlloc] = useState({}) // docId -> amount string
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sameCompany = (x) => String(x.company) === String(header.company)
  const parties = (isReceipt ? master.customers : master.suppliers).filter(sameCompany)

  useEffect(() => {
    if (!header.party) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenDocs([])
      return
    }
    const load = isReceipt ? getSalesInvoices : getPurchaseBills
    load({ [partyField]: header.party }).then((res) => {
      setOpenDocs(res.data.filter((d) => ['UNPAID', 'PARTIALLY_PAID'].includes(d.status))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id)))
      setAlloc({})
    })
  }, [header.party, isReceipt, partyField])

  const set = (name, value) => setHeader((h) => ({ ...h, [name]: value, ...(name === 'company' ? { party: '', branch: '' } : {}) }))

  // Settle the oldest documents first.
  const autoAllocate = (amount) => {
    let left = num(amount)
    const next = {}
    for (const d of openDocs) {
      if (left <= 0) break
      const take = Math.min(left, num(d.balance_due))
      next[d.id] = String(Math.round(take * 100) / 100)
      left -= take
    }
    setAlloc(next)
  }

  const allocated = Object.values(alloc).reduce((s, v) => s + num(v), 0)
  const advance = num(header.amount) - allocated

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createPayment({
        company: header.company, branch: header.branch || null, payment_type: type, [partyField]: header.party,
        date: header.date, amount: header.amount, mode: header.mode, reference: header.reference, notes: header.notes,
        allocations: Object.entries(alloc).filter(([, v]) => num(v) > 0).map(([id, v]) => ({ [docField]: Number(id), amount: v })),
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Failed to save.'))
      setSubmitting(false)
    }
  }

  return (
    <Modal title={isReceipt ? 'Receive from Customer' : 'Pay Supplier'} size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <label className="form-label">Company *</label>
            <select className="form-select" value={header.company} required onChange={(e) => set('company', e.target.value)}>
              <option value="">-- Select --</option>
              {master.companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">{isReceipt ? 'Customer' : 'Supplier'} *</label>
            <select className="form-select" value={header.party} required disabled={!header.company} onChange={(e) => set('party', e.target.value)}>
              <option value="">-- Select --</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <input type="date" className="form-control" required value={header.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Amount *</label>
            <input type="number" step="0.01" min="0.01" className="form-control" required value={header.amount}
              onChange={(e) => { set('amount', e.target.value); autoAllocate(e.target.value) }} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Mode</label>
            <select className="form-select" value={header.mode} onChange={(e) => set('mode', e.target.value)}>
              {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Reference (UTR / cheque no.)</label>
            <input className="form-control" value={header.reference} onChange={(e) => set('reference', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Notes</label>
            <input className="form-control" value={header.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {header.party && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0">Settle against open {isReceipt ? 'invoices' : 'bills'}</h6>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => autoAllocate(header.amount)}>Auto-allocate (oldest first)</button>
            </div>
            <table className="table table-sm align-middle">
              <thead><tr><th>Number</th><th>Date</th><th className="text-end">Total</th><th className="text-end">Balance</th><th style={{ width: 150 }}>Allocate</th></tr></thead>
              <tbody>
                {openDocs.map((d) => (
                  <tr key={d.id}>
                    <td>{d.number}{d.supplier_invoice_number ? ` (${d.supplier_invoice_number})` : ''}</td>
                    <td>{shortDate(d.date)}</td>
                    <td className="text-end">{money(d.grand_total)}</td>
                    <td className="text-end">{money(d.balance_due)}</td>
                    <td>
                      <input type="number" step="0.01" min="0" max={num(d.balance_due)} className="form-control form-control-sm"
                        value={alloc[d.id] ?? ''} onChange={(e) => setAlloc({ ...alloc, [d.id]: e.target.value })} />
                    </td>
                  </tr>
                ))}
                {openDocs.length === 0 && <tr><td colSpan="5" className="text-center text-muted">No open {isReceipt ? 'invoices' : 'bills'} — the full amount will be kept as an advance.</td></tr>}
              </tbody>
            </table>
            <div className="text-end small">
              Allocated <strong>{money(allocated)}</strong>
              {advance > 0.004 && <> · Advance on account <strong>{money(advance)}</strong></>}
              {advance < -0.004 && <span className="text-danger"> · Allocated more than the amount</span>}
            </div>
          </>
        )}

        <div className="d-flex justify-content-end gap-2 mt-3">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={submitting || advance < -0.004}>
            {submitting ? 'Saving...' : isReceipt ? 'Save Receipt' : 'Save Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function OutstandingTab({ master, reloadKey, onSettle }) {
  const [kind, setKind] = useState('receivable')
  const [company, setCompany] = useState('')
  const [data, setData] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    getOutstanding({ type: kind, company: company || undefined }).then((res) => setData(res.data))
  }, [kind, company, reloadKey])

  const partyCompany = (partyId) => (kind === 'receivable' ? master.customerById : master.supplierById)[partyId]?.company

  return (
    <div>
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <div className="btn-group">
          <button className={`btn ${kind === 'receivable' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setKind('receivable')}>Receivable (customers)</button>
          <button className={`btn ${kind === 'payable' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setKind('payable')}>Payable (suppliers)</button>
        </div>
        <select className="form-select" style={{ maxWidth: 240 }} value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="">All companies</option>
          {master.companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
        </select>
      </div>

      {!data ? <p>Loading...</p> : (
        <div className="table-responsive">
          <table className="table table-striped align-middle">
            <thead>
              <tr>
                <th>{kind === 'receivable' ? 'Customer' : 'Supplier'}</th>
                {BUCKETS.map(([k, l]) => <th key={k} className="text-end">{l}</th>)}
                <th className="text-end">Total due</th><th className="text-end">Advance</th><th className="text-end">Net due</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.parties.map((p) => (
                <PartyRows key={p.party_id} p={p} kind={kind} docs={data.documents.filter((d) => d.party_id === p.party_id)}
                  expanded={expanded === p.party_id} onToggle={() => setExpanded(expanded === p.party_id ? null : p.party_id)}
                  onSettle={() => onSettle(kind === 'receivable' ? 'RECEIPT' : 'PAYMENT', partyCompany(p.party_id), p.party_id)} />
              ))}
              {data.parties.length === 0 && <tr><td colSpan="10" className="text-center text-muted">Nothing outstanding.</td></tr>}
            </tbody>
            {data.parties.length > 0 && (
              <tfoot>
                <tr className="fw-bold">
                  <td>Total</td>
                  {BUCKETS.map(([k]) => <td key={k} className="text-end">{money(data.totals[k])}</td>)}
                  <td className="text-end">{money(data.totals.total_due)}</td>
                  <td className="text-end">{money(data.totals.advance)}</td>
                  <td className="text-end">{money(data.totals.net_due)}</td><td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

function PartyRows({ p, kind, docs, expanded, onToggle, onSettle }) {
  return (
    <>
      <tr>
        <td><button className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={onToggle}>{expanded ? '▾' : '▸'} {p.party_name}</button></td>
        {BUCKETS.map(([k]) => <td key={k} className={`text-end ${k === 'over_90' && num(p[k]) ? 'text-danger fw-semibold' : ''}`}>{num(p[k]) ? money(p[k]) : '—'}</td>)}
        <td className="text-end">{money(p.total_due)}</td>
        <td className="text-end">{num(p.advance) ? money(p.advance) : '—'}</td>
        <td className="text-end fw-semibold">{money(p.net_due)}</td>
        <td className="text-end"><button className="btn btn-sm btn-success" onClick={onSettle}>{kind === 'receivable' ? 'Receive' : 'Pay'}</button></td>
      </tr>
      {expanded && docs.map((d) => (
        <tr key={d.id} className="small">
          <td className="ps-4">{d.number} · {shortDate(d.date)}{d.due_date ? ` · due ${shortDate(d.due_date)}` : ''}</td>
          <td colSpan="5" className="text-muted">{d.days_overdue ? `${d.days_overdue} days overdue` : 'Not yet due'}</td>
          <td className="text-end">{money(d.balance_due)}</td><td colSpan="3"></td>
        </tr>
      ))}
    </>
  )
}

function LedgerTab({ master, reloadKey }) {
  const [partyType, setPartyType] = useState('customer')
  const [party, setParty] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!party) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null)
      return
    }
    getLedger({ party_type: partyType, party, date_from: dateFrom || undefined, date_to: dateTo || undefined })
      .then((res) => { setData(res.data); setError('') })
      .catch((err) => setError(errorMessage(err)))
  }, [partyType, party, dateFrom, dateTo, reloadKey])

  const parties = partyType === 'customer' ? master.customers : master.suppliers
  const balanceLabel = partyType === 'customer' ? 'Receivable' : 'Payable'

  const exportCsv = () => downloadCsv(`ledger-${data.party.name}.csv`, data.entries, [
    { key: 'date', label: 'Date' }, { key: 'type', label: 'Type' }, { key: 'number', label: 'Number' },
    { key: 'reference', label: 'Reference' }, { key: 'debit', label: 'Debit' }, { key: 'credit', label: 'Credit' },
    { key: 'balance', label: 'Balance' },
  ])

  return (
    <div>
      <div className="row g-2 mb-3 no-print">
        <div className="col-md-2">
          <select className="form-select" value={partyType} onChange={(e) => { setPartyType(e.target.value); setParty('') }}>
            <option value="customer">Customer</option>
            <option value="supplier">Supplier</option>
          </select>
        </div>
        <div className="col-md-4">
          <select className="form-select" value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">-- Select {partyType} --</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}{master.companies.length > 1 ? ` · ${master.companyById[p.company]?.name}` : ''}</option>)}
          </select>
        </div>
        <div className="col-md-2"><input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From" /></div>
        <div className="col-md-2"><input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To" /></div>
        <div className="col-md-2 d-flex gap-1">
          <button className="btn btn-outline-secondary w-100" disabled={!data} onClick={exportCsv}>CSV</button>
          <button className="btn btn-outline-secondary w-100" disabled={!data} onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!party && <p className="text-muted">Choose a {partyType} to see their account statement.</p>}
      {data && (
        <div className="card card-body">
          <h5 className="mb-0">{data.party.name}</h5>
          <div className="text-muted small mb-3">
            {data.party.gst_number ? `GSTIN ${data.party.gst_number} · ` : ''}
            {dateFrom || dateTo ? `${dateFrom ? shortDate(dateFrom) : 'Start'} to ${dateTo ? shortDate(dateTo) : 'today'}` : 'All dates'}
          </div>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Number</th><th>Reference</th><th className="text-end">Debit</th><th className="text-end">Credit</th><th className="text-end">Balance</th></tr>
              </thead>
              <tbody>
                {(dateFrom && num(data.opening_balance) !== 0) && (
                  <tr className="text-muted"><td colSpan="6">Opening balance</td><td className="text-end">{money(data.opening_balance)}</td></tr>
                )}
                {data.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{shortDate(e.date)}</td><td>{e.type}</td><td>{e.number}</td><td>{e.reference}</td>
                    <td className="text-end">{num(e.debit) ? money(e.debit) : ''}</td>
                    <td className="text-end">{num(e.credit) ? money(e.credit) : ''}</td>
                    <td className="text-end">{money(e.balance)}</td>
                  </tr>
                ))}
                {data.entries.length === 0 && <tr><td colSpan="7" className="text-center text-muted">No transactions in this period.</td></tr>}
              </tbody>
              <tfoot>
                <tr className="fw-bold">
                  <td colSpan="4">Closing balance ({num(data.closing_balance) >= 0 ? balanceLabel : 'Advance'})</td>
                  <td className="text-end">{money(data.total_debit)}</td>
                  <td className="text-end">{money(data.total_credit)}</td>
                  <td className="text-end">{money(data.closing_balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
