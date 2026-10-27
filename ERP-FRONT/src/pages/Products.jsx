import { useEffect, useState } from 'react'
import { getProducts, createProduct, updateProduct } from '../api/products'
import { getCompanies } from '../api/companies'
import {
  getBrands, getGroups, getSubGroups, getUnits, getGstMasters,
} from '../api/masters'

const emptyForm = {
  company: '',
  code: '',
  name: '',
  product_type: 'GOODS',
  brand: '',
  group: '',
  sub_group: '',
  unit: '',
  gst_master: '',
  cost_price: '0',
  purchase_price: '0',
  selling_price: '0',
  mrp: '0',
  tax_type: 'EXCLUSIVE',
  gst_type: 'TAXABLE',
  hsn_code: '',
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [companies, setCompanies] = useState([])
  const [brands, setBrands] = useState([])
  const [groups, setGroups] = useState([])
  const [subGroups, setSubGroups] = useState([])
  const [units, setUnits] = useState([])
  const [gstMasters, setGstMasters] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      getProducts(), getCompanies(), getBrands(), getGroups(),
      getSubGroups(), getUnits(), getGstMasters(),
    ])
      .then(([p, c, b, g, sg, u, gst]) => {
        setProducts(p.data)
        setCompanies(c.data)
        setBrands(b.data)
        setGroups(g.data)
        setSubGroups(sg.data)
        setUnits(u.data)
        setGstMasters(gst.data)
      })
      .catch(() => setError('Failed to load products.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'group' ? { sub_group: '' } : {}),
      ...(name === 'company' ? { group: '', sub_group: '', brand: '', unit: '', gst_master: '' } : {}),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const payload = { ...formData }
      ;['brand', 'group', 'sub_group', 'unit', 'gst_master'].forEach((f) => {
        if (payload[f] === '') payload[f] = null
      })
      await createProduct(payload)
      setFormData(emptyForm)
      setShowForm(false)
      loadAll()
    } catch (err) {
      const data = err.response?.data
      setFormError(
        data ? Object.entries(data).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join(' | ') : 'Failed to create product.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const companyName = (id) => companies.find((c) => c.id === id)?.name ?? id

  const visibleGroups = groups.filter((g) => String(g.company) === String(formData.company))
  const visibleSubGroups = subGroups.filter((sg) => String(sg.group) === String(formData.group))
  const visibleBrands = brands.filter((b) => String(b.company) === String(formData.company))
  const visibleUnits = units.filter((u) => String(u.company) === String(formData.company))
  const visibleGstMasters = gstMasters.filter((g) => String(g.company) === String(formData.company))

  const startEdit = (p) => {
    setEditingId(p.id)
    setEditData({ code: p.code, name: p.name, selling_price: p.selling_price })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = async (id) => {
    try {
      await updateProduct(id, editData)
      setEditingId(null)
      loadAll()
    } catch {
      alert('Failed to save changes.')
    }
  }

  const toggleStatus = async (p) => {
    try {
      await updateProduct(p.id, { status: !p.status })
      loadAll()
    } catch {
      alert('Failed to update status.')
    }
  }

  return (
    <div className="container mt-4">
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="stat-card bg-orange">
            <div className="stat-icon">📦</div>
            <div className="stat-label">Total Products</div>
            <div className="stat-value">{products.length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-indigo">
            <div className="stat-icon">✅</div>
            <div className="stat-label">Active</div>
            <div className="stat-value">{products.filter((p) => p.status).length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-teal">
            <div className="stat-icon">💰</div>
            <div className="stat-label">Avg. Selling Price</div>
            <div className="stat-value">
              {products.length
                ? (products.reduce((sum, p) => sum + parseFloat(p.selling_price || 0), 0) / products.length).toFixed(0)
                : 0}
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Products</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Product'}
        </button>
      </div>

      {showForm && (
        <div className="product-modal" role="dialog" aria-modal="true" aria-labelledby="new-product-title">
          <div className="product-modal-dialog">
            <div className="product-modal-header">
              <h3 id="new-product-title">New Product</h3>
              <button type="button" className="product-modal-close" onClick={() => setShowForm(false)} aria-label="Close">
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit} className="product-modal-form">
              {formError && <div className="alert alert-danger">{formError}</div>}
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label">Company</label>
                  <select className="form-select" name="company" value={formData.company} onChange={handleChange} required>
                    <option value="">-- Select --</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label">Code / SKU</label>
                  <input className="form-control" name="code" value={formData.code} onChange={handleChange} required />
                </div>
                <div className="col-md-4">
                  <label className="form-label">Name</label>
                  <input className="form-control" name="name" value={formData.name} onChange={handleChange} required />
                </div>

                <div className="col-md-4">
                  <label className="form-label">Brand</label>
                  <select className="form-select" name="brand" value={formData.brand} onChange={handleChange} disabled={!formData.company}>
                    <option value="">-- None --</option>
                    {visibleBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label">Group</label>
                  <select className="form-select" name="group" value={formData.group} onChange={handleChange} disabled={!formData.company}>
                    <option value="">-- None --</option>
                    {visibleGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label">Sub Group</label>
                  <select className="form-select" name="sub_group" value={formData.sub_group} onChange={handleChange} disabled={!formData.group}>
                    <option value="">-- None --</option>
                    {visibleSubGroups.map((sg) => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
                  </select>
                </div>

                <div className="col-md-4">
                  <label className="form-label">Unit</label>
                  <select className="form-select" name="unit" value={formData.unit} onChange={handleChange} disabled={!formData.company}>
                    <option value="">-- None --</option>
                    {visibleUnits.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.short_name})</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label">GST Master</label>
                  <select className="form-select" name="gst_master" value={formData.gst_master} onChange={handleChange} disabled={!formData.company}>
                    <option value="">-- None --</option>
                    {visibleGstMasters.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label">HSN Code</label>
                  <input className="form-control" name="hsn_code" value={formData.hsn_code} onChange={handleChange} />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Cost Price</label>
                  <input type="number" step="0.01" className="form-control" name="cost_price" value={formData.cost_price} onChange={handleChange} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Purchase Price</label>
                  <input type="number" step="0.01" className="form-control" name="purchase_price" value={formData.purchase_price} onChange={handleChange} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">Selling Price</label>
                  <input type="number" step="0.01" className="form-control" name="selling_price" value={formData.selling_price} onChange={handleChange} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">MRP</label>
                  <input type="number" step="0.01" className="form-control" name="mrp" value={formData.mrp} onChange={handleChange} />
                </div>
              </div>
              <button type="submit" className="btn btn-success mt-3" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Product'}
              </button>
            </form>
          </div>
        </div>
      )}

      {loading && <p>Loading...</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Company</th>
              <th>Selling Price</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {editingId === p.id ? (
                    <input
                      className="form-control form-control-sm"
                      value={editData.code}
                      onChange={(e) => setEditData({ ...editData, code: e.target.value })}
                    />
                  ) : p.code}
                </td>
                <td>
                  {editingId === p.id ? (
                    <input
                      className="form-control form-control-sm"
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    />
                  ) : p.name}
                </td>
                <td>{companyName(p.company)}</td>
                <td>
                  {editingId === p.id ? (
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      value={editData.selling_price}
                      onChange={(e) => setEditData({ ...editData, selling_price: e.target.value })}
                    />
                  ) : p.selling_price}
                </td>
                <td>
                  <span className={`badge ${p.status ? 'bg-success' : 'bg-secondary'}`}>
                    {p.status ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  {editingId === p.id ? (
                    <div className="d-flex gap-1">
                      <button className="btn btn-success btn-sm" onClick={() => saveEdit(p.id)}>Save</button>
                      <button className="btn btn-outline-secondary btn-sm" onClick={cancelEdit}>Cancel</button>
                    </div>
                  ) : (
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => startEdit(p)}>Edit</button>
                      <button
                        className={`btn btn-sm ${p.status ? 'btn-outline-danger' : 'btn-outline-success'}`}
                        onClick={() => toggleStatus(p)}
                      >
                        {p.status ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan="6" className="text-center text-muted">No products found.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}