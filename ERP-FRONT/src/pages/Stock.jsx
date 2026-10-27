import { useEffect, useState } from 'react'
import { getCompanies } from '../api/companies'
import { getProducts } from '../api/products'
import { getWarehouses } from '../api/masters'
import {
  getStockBalances, getStockMovements,
  postOpeningStock, postStockAdjustment, postStockTransfer,
} from '../api/stock'

const TABS = [
  { key: 'balances', label: 'Balances' },
  { key: 'movements', label: 'Movements' },
  { key: 'opening', label: 'Opening Stock' },
  { key: 'adjustment', label: 'Adjustment' },
  { key: 'transfer', label: 'Transfer' },
]

export default function Stock() {
  const [tab, setTab] = useState('balances')

  const [companies, setCompanies] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [balances, setBalances] = useState([])
  const [movements, setMovements] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      getCompanies(), getProducts(), getWarehouses(),
      getStockBalances(), getStockMovements(),
    ])
      .then(([co, p, wh, bal, mov]) => {
        setCompanies(co.data)
        setProducts(p.data)
        setWarehouses(wh.data)
        setBalances(bal.data)
        setMovements(mov.data)
      })
      .catch(() => setError('Failed to load stock data.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [])

  return (
    <div className="container mt-4">
      <h2 className="mb-3">Stock</h2>

      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              className={`nav-link ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <p>Loading...</p>}

      {!loading && !error && (
        <>
          {tab === 'balances' && (
            <table className="table table-striped">
              <thead><tr><th>Product</th><th>Warehouse</th><th>Quantity</th></tr></thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id}><td>{b.product_name}</td><td>{b.warehouse_name}</td><td>{b.quantity}</td></tr>
                ))}
                {balances.length === 0 && <tr><td colSpan="3" className="text-center text-muted">No stock recorded.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'movements' && (
            <table className="table table-striped">
              <thead><tr><th>Date</th><th>Product</th><th>Warehouse</th><th>Type</th><th>Qty</th><th>Note</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                    <td>{products.find((p) => p.id === m.product)?.name ?? m.product}</td>
                    <td>{warehouses.find((w) => w.id === m.warehouse)?.name ?? m.warehouse}</td>
                    <td>{m.movement_type}</td>
                    <td>{m.quantity}</td>
                    <td>{m.reference_note}</td>
                  </tr>
                ))}
                {movements.length === 0 && <tr><td colSpan="6" className="text-center text-muted">No movements recorded.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'opening' && (
            <StockActionForm
              action={postOpeningStock}
              companies={companies} products={products} warehouses={warehouses}
              onSaved={loadAll}
              fields={['company', 'product', 'warehouse', 'quantity', 'note']}
              submitLabel="Record Opening Stock"
            />
          )}

          {tab === 'adjustment' && (
            <StockActionForm
              action={postStockAdjustment}
              companies={companies} products={products} warehouses={warehouses}
              onSaved={loadAll}
              fields={['company', 'product', 'warehouse', 'quantity', 'note']}
              submitLabel="Record Adjustment"
              quantityHelp="Signed: positive to add, negative to remove."
            />
          )}

          {tab === 'transfer' && (
            <TransferForm
              companies={companies} products={products} warehouses={warehouses}
              onSaved={loadAll}
            />
          )}
        </>
      )}
    </div>
  )
}

function StockActionForm({ action, companies, products, warehouses, onSaved, submitLabel, quantityHelp }) {
  const [form, setForm] = useState({ company: '', product: '', warehouse: '', quantity: '', note: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const visibleProducts = products.filter((p) => String(p.company) === String(form.company))
  const visibleWarehouses = warehouses.filter((w) => String(w.company) === String(form.company))

  const handleCompanyChange = (e) => {
    setForm({ ...form, company: e.target.value, product: '', warehouse: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      await action(form)
      setSuccess('Saved successfully.')
      setForm({ company: form.company, product: '', warehouse: '', quantity: '', note: '' })
      onSaved()
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(' ') || 'Failed to save.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card card-body mb-4">
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <div className="row g-3 align-items-end">
        <div className="col-md-3">
          <label className="form-label">Company</label>
          <select className="form-select" value={form.company} onChange={handleCompanyChange} required>
            <option value="">-- Select --</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Product</label>
          <select className="form-select" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} required disabled={!form.company}>
            <option value="">-- Select --</option>
            {visibleProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Warehouse</label>
          <select className="form-select" value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} required disabled={!form.company}>
            <option value="">-- Select --</option>
            {visibleWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <label className="form-label">Quantity</label>
          <input type="number" step="0.01" className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          {quantityHelp && <div className="form-text">{quantityHelp}</div>}
        </div>
        <div className="col-md-1">
          <button className="btn btn-success w-100" disabled={submitting}>{submitLabel}</button>
        </div>
        <div className="col-md-12">
          <label className="form-label">Note</label>
          <input className="form-control" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>
    </form>
  )
}

function TransferForm({ companies, products, warehouses, onSaved }) {
  const [form, setForm] = useState({ company: '', product: '', from_warehouse: '', to_warehouse: '', quantity: '', note: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const visibleProducts = products.filter((p) => String(p.company) === String(form.company))
  const visibleWarehouses = warehouses.filter((w) => String(w.company) === String(form.company))

  const handleCompanyChange = (e) => {
    setForm({ ...form, company: e.target.value, product: '', from_warehouse: '', to_warehouse: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      await postStockTransfer(form)
      setSuccess('Transfer completed.')
      setForm({ ...form, product: '', from_warehouse: '', to_warehouse: '', quantity: '', note: '' })
      onSaved()
    } catch (err) {
      setError(Object.values(err.response?.data || {}).flat().join(' ') || 'Failed to transfer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card card-body mb-4">
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <div className="row g-3 align-items-end">
        <div className="col-md-3">
          <label className="form-label">Company</label>
          <select className="form-select" value={form.company} onChange={handleCompanyChange} required>
            <option value="">-- Select --</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Product</label>
          <select className="form-select" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} required disabled={!form.company}>
            <option value="">-- Select --</option>
            {visibleProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">From Warehouse</label>
          <select className="form-select" value={form.from_warehouse} onChange={(e) => setForm({ ...form, from_warehouse: e.target.value })} required disabled={!form.company}>
            <option value="">-- Select --</option>
            {visibleWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">To Warehouse</label>
          <select className="form-select" value={form.to_warehouse} onChange={(e) => setForm({ ...form, to_warehouse: e.target.value })} required disabled={!form.company}>
            <option value="">-- Select --</option>
            {visibleWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Quantity</label>
          <input type="number" step="0.01" className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </div>
        <div className="col-md-7">
          <label className="form-label">Note</label>
          <input className="form-control" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <div className="col-md-2">
          <button className="btn btn-success w-100" disabled={submitting}>Transfer</button>
        </div>
      </div>
    </form>
  )
}