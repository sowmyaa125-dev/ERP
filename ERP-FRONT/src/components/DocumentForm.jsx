import { useState } from 'react'
import Modal from './Modal'
import LineItemsEditor, { blankLine } from './LineItemsEditor'
import { errorMessage, today } from '../utils/format'

/**
 * Create/edit form shared by purchase orders, bills, quotations, sales orders and invoices.
 *
 * extraFields: header fields beyond company/branch/party/date/notes, e.g.
 *   { name: 'warehouse', label: 'Warehouse', type: 'warehouse', required: true }
 *   { name: 'due_date', label: 'Due date', type: 'date' }
 *   { name: 'supplier_invoice_number', label: 'Supplier invoice no.', type: 'text', required: true }
 *   { name: 'update_stock', label: 'Add these items to stock', type: 'checkbox' }
 * initial.links: ids sent as-is but not editable (purchase_order, sales_order, goods_receipt...).
 * lockParty: company/party fixed because the document comes from an order.
 */
export default function DocumentForm({
  title, partyType, priceField, extraFields = [], master, initial = {}, lockParty = false,
  onSubmit, onClose, submitLabel = 'Save',
}) {
  const [header, setHeader] = useState(() => ({
    company: '', branch: '', party: '', date: today(), notes: '',
    ...Object.fromEntries(extraFields.map((f) => [f.name, f.type === 'checkbox' ? false : ''])),
    ...initial.header,
  }))
  const [lines, setLines] = useState(() => (initial.lines?.length ? initial.lines : [blankLine()]))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const parties = partyType === 'customer' ? master.customers : master.suppliers
  const sameCompany = (x) => String(x.company) === String(header.company)
  const company = master.companyById[header.company]
  const branch = master.branchById[header.branch]
  const party = parties.find((p) => String(p.id) === String(header.party))

  const ourState = (branch?.state || company?.state || '').trim().toLowerCase()
  const theirState = (party?.state || '').trim().toLowerCase()
  const interState = Boolean(ourState && theirState && ourState !== theirState)

  const set = (name, value) => setHeader((h) => ({
    ...h,
    [name]: value,
    // Changing company invalidates everything that belongs to a company.
    ...(name === 'company' ? { branch: '', party: '', warehouse: '' } : {}),
  }))

  const changeCompany = (value) => {
    set('company', value)
    setLines([blankLine()])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { party: partyId, branch: branchId, ...rest } = header
    const payload = {
      ...rest,
      ...initial.links,
      branch: branchId || null,
      [partyType]: partyId,
      items: lines.map(({ key, max_quantity, ...l }) => ({ ...l, order_item: l.order_item || undefined })),
    }
    for (const f of extraFields) {
      if (f.type !== 'checkbox' && f.type !== 'text' && payload[f.name] === '') payload[f.name] = null
    }
    try {
      await onSubmit(payload)
    } catch (err) {
      setError(errorMessage(err, 'Failed to save.'))
      setSubmitting(false)
    }
  }

  const renderExtra = (f) => {
    if (f.showIf && !f.showIf(header)) return null
    if (f.type === 'checkbox') {
      return (
        <div className="col-md-4 d-flex align-items-end" key={f.name}>
          <div className="form-check mb-2">
            <input id={`f-${f.name}`} type="checkbox" className="form-check-input"
              checked={Boolean(header[f.name])} onChange={(e) => set(f.name, e.target.checked)} />
            <label htmlFor={`f-${f.name}`} className="form-check-label">{f.label}</label>
          </div>
        </div>
      )
    }
    const required = typeof f.required === 'function' ? f.required(header) : f.required
    return (
      <div className="col-md-4" key={f.name}>
        <label className="form-label">{f.label}{required ? ' *' : ''}</label>
        {f.type === 'warehouse' ? (
          <select className="form-select" value={header[f.name] ?? ''} required={required}
            disabled={!header.company} onChange={(e) => set(f.name, e.target.value)}>
            <option value="">-- Select --</option>
            {master.warehouses.filter(sameCompany).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        ) : (
          <input type={f.type} className="form-control" value={header[f.name] ?? ''} required={required}
            onChange={(e) => set(f.name, e.target.value)} />
        )}
      </div>
    )
  }

  return (
    <Modal title={title} size="xl" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger">{error}</div>}
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <label className="form-label">Company *</label>
            <select className="form-select" value={header.company} required disabled={lockParty}
              onChange={(e) => changeCompany(e.target.value)}>
              <option value="">-- Select --</option>
              {master.companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Branch</label>
            <select className="form-select" value={header.branch ?? ''} disabled={!header.company}
              onChange={(e) => set('branch', e.target.value)}>
              <option value="">-- None --</option>
              {master.branches.filter(sameCompany).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">{partyType === 'customer' ? 'Customer' : 'Supplier'} *</label>
            <select className="form-select" value={header.party} required disabled={!header.company || lockParty}
              onChange={(e) => set('party', e.target.value)}>
              <option value="">-- Select --</option>
              {parties.filter(sameCompany).filter((p) => p.status !== 'INACTIVE' || String(p.id) === String(header.party))
                .map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
            </select>
            {party && (
              <div className="form-text">
                {party.gst_number ? `GSTIN ${party.gst_number} · ` : ''}
                {interState ? 'Inter-state supply (IGST)' : 'Intra-state supply (CGST + SGST)'}
              </div>
            )}
          </div>
          <div className="col-md-4">
            <label className="form-label">Date *</label>
            <input type="date" className="form-control" value={header.date} required
              onChange={(e) => set('date', e.target.value)} />
          </div>
          {extraFields.map(renderExtra)}
        </div>

        <LineItemsEditor
          lines={lines} onChange={setLines}
          products={master.products.filter((p) => sameCompany(p) && p.status !== false)}
          priceField={priceField} gstRateById={master.gstRateById} unitById={master.unitById}
          interState={interState}
        />

        <div className="mt-3">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows="2" value={header.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)} />
        </div>

        <div className="d-flex justify-content-end gap-2 mt-3">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={submitting}>
            {submitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
