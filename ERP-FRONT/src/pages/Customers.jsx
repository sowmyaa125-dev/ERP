import { useEffect, useState } from 'react'
import { getAllStates, getDistricts } from 'india-state-district'
import { getCustomers, createCustomer, updateCustomer } from '../api/customers'
import { getCompanies } from '../api/companies'
import { getBranches } from '../api/branches'

const emptyForm = {
  company: '', branch: '', name: '', code: '', email: '', phone: '',
  address: '', state: '', district: '', pin_code: '', gst_number: '',
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [companies, setCompanies] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const loadAll = () => {
    setLoading(true)
    Promise.all([getCustomers(), getCompanies(), getBranches()])
      .then(([cu, co, br]) => {
        setCustomers(cu.data)
        setCompanies(co.data)
        setBranches(br.data)
      })
      .catch(() => setError('Failed to load customers.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [])

  const openModal = () => {
    setFormData(emptyForm)
    setFormError('')
    setShowModal(true)
  }
  const closeModal = () => setShowModal(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'company' ? { branch: '' } : {}),
      ...(name === 'state' ? { district: '' } : {}),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      const payload = { ...formData, branch: formData.branch || null }
      await createCustomer(payload)
      setFormData(emptyForm)
      setShowModal(false)
      loadAll()
    } catch (err) {
      const data = err.response?.data
      setFormError(
        data ? Object.entries(data).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`).join(' | ') : 'Failed to create customer.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const companyName = (id) => companies.find((c) => c.id === id)?.name ?? id
  const visibleBranches = branches.filter((b) => String(b.company) === String(formData.company))

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditData({ name: c.name, code: c.code || '', email: c.email || '', phone: c.phone || '' })
  }
  const cancelEdit = () => { setEditingId(null); setEditData({}) }
  const saveEdit = async (id) => {
    try {
      await updateCustomer(id, editData)
      setEditingId(null)
      loadAll()
    } catch { alert('Failed to save changes.') }
  }
  const toggleStatus = async (c) => {
    const nextStatus = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await updateCustomer(c.id, { status: nextStatus })
      loadAll()
    } catch { alert('Failed to update status.') }
  }

  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="container mt-4">
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="stat-card bg-indigo">
            <div className="stat-icon">👥</div>
            <div className="stat-label">Total Customers</div>
            <div className="stat-value">{customers.length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-teal">
            <div className="stat-icon">✅</div>
            <div className="stat-label">Active</div>
            <div className="stat-value">{customers.filter((c) => c.status === 'ACTIVE').length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-orange">
            <div className="stat-icon">🏢</div>
            <div className="stat-label">With GST Number</div>
            <div className="stat-value">{customers.filter((c) => c.gst_number).length}</div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h2 className="mb-0">Customers</h2>
          <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>Manage your customer records</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>+ New Customer</button>
      </div>

      {!loading && !error && customers.length > 0 && (
        <div className="mb-3">
          <input
            type="text"
            className="form-control"
            style={{ maxWidth: '320px' }}
            placeholder="🔍 Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading && <p className="text-muted">Loading customers...</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && customers.length === 0 && (
        <div className="text-center py-5 chart-card">
          <div style={{ fontSize: '2.5rem' }}>👥</div>
          <h5 className="mt-2">No customers yet</h5>
          <p className="text-muted">Add your first customer to get started.</p>
          <button className="btn btn-primary" onClick={openModal}>+ New Customer</button>
        </div>
      )}

      {!loading && !error && customers.length > 0 && (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Company</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((c) => (
              <tr key={c.id}>
                <td>
                  {editingId === c.id ? (
                    <div className="d-flex gap-2">
                      <input className="form-control form-control-sm" style={{ maxWidth: 90 }} value={editData.code}
                        onChange={(e) => setEditData({ ...editData, code: e.target.value })} placeholder="Code" />
                      <input className="form-control form-control-sm" value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })} placeholder="Name" />
                    </div>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <span
                        style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #16a34a, #14532d)',
                          color: '#fff', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700,
                        }}
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.code && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{c.code}</div>}
                      </div>
                    </div>
                  )}
                </td>
                <td>{companyName(c.company)}</td>
                <td>
                  {editingId === c.id ? (
                    <input className="form-control form-control-sm" value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
                  ) : (c.email || '-')}
                </td>
                <td>
                  {editingId === c.id ? (
                    <input className="form-control form-control-sm" value={editData.phone}
                      onChange={(e) => setEditData({ ...editData, phone: e.target.value })} />
                  ) : (c.phone || '-')}
                </td>
                <td>
                  <span className={`badge ${c.status === 'ACTIVE' ? 'bg-success' : 'bg-secondary'}`}>
                    {c.status}
                  </span>
                </td>
                <td>
                  {editingId === c.id ? (
                    <div className="d-flex gap-1">
                      <button className="btn btn-success btn-sm" onClick={() => saveEdit(c.id)}>Save</button>
                      <button className="btn btn-outline-secondary btn-sm" onClick={cancelEdit}>Cancel</button>
                    </div>
                  ) : (
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => startEdit(c)}>Edit</button>
                      <button
                        className={`btn btn-sm ${c.status === 'ACTIVE' ? 'btn-outline-danger' : 'btn-outline-success'}`}
                        onClick={() => toggleStatus(c)}
                      >
                        {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filteredCustomers.length === 0 && (
              <tr><td colSpan="6" className="text-center text-muted py-4">No customers match your search.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showModal && (
        <>
          <div className="modal fade show" style={{ display: 'block' }} tabIndex="-1">
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content" style={{ borderRadius: 14, border: 'none' }}>
                <div
                  className="modal-header"
                  style={{ background: 'linear-gradient(135deg, #16a34a, #14532d)', color: '#fff', borderRadius: '14px 14px 0 0' }}
                >
                  <h5 className="modal-title">New Customer</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={closeModal}></button>
                </div>
                <form onSubmit={handleSubmit}>
                  <div className="modal-body">
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
                        <label className="form-label">Branch (optional)</label>
                        <select className="form-select" name="branch" value={formData.branch} onChange={handleChange} disabled={!formData.company}>
                          <option value="">-- None --</option>
                          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Code</label>
                        <input className="form-control" name="code" value={formData.code} onChange={handleChange} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Name</label>
                        <input className="form-control" name="name" value={formData.name} onChange={handleChange} required />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Email</label>
                        <input type="email" className="form-control" name="email" value={formData.email} onChange={handleChange} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Phone</label>
                        <input className="form-control" name="phone" value={formData.phone} onChange={handleChange} />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">State</label>
                        <select className="form-select" name="state" value={formData.state} onChange={handleChange}>
                          <option value="">-- Select --</option>
                          {getAllStates().map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">District</label>
                        <select
                          className="form-select"
                          name="district"
                          value={formData.district}
                          onChange={handleChange}
                          disabled={!formData.state}
                        >
                          <option value="">-- Select --</option>
                          {(formData.state ? getDistricts(formData.state) : []).map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Pin Code</label>
                        <input className="form-control" name="pin_code" value={formData.pin_code} onChange={handleChange} />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">GST Number</label>
                        <input className="form-control" name="gst_number" value={formData.gst_number} onChange={handleChange} />
                      </div>
                      <div className="col-md-12">
                        <label className="form-label">Address</label>
                        <input className="form-control" name="address" value={formData.address} onChange={handleChange} />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={closeModal}>Cancel</button>
                    <button type="submit" className="btn btn-success" disabled={submitting}>
                      {submitting ? 'Saving...' : 'Save Customer'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  )
}