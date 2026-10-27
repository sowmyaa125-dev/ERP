import { useEffect, useState } from 'react'
import { getBranches, createBranch, updateBranch } from '../api/branches'
import { getCompanies } from '../api/companies'

export default function Branches() {
  const [branches, setBranches] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    company: '',
    branch_code: '',
    name: '',
    state: '',
    district: '',
  })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const loadData = () => {
    setLoading(true)
    Promise.all([getBranches(), getCompanies()])
      .then(([branchesRes, companiesRes]) => {
        setBranches(branchesRes.data)
        setCompanies(companiesRes.data)
      })
      .catch(() => setError('Failed to load branches.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      await createBranch(formData)
      setFormData({ company: '', branch_code: '', name: '', state: '', district: '' })
      setShowForm(false)
      loadData()
    } catch (err) {
      const data = err.response?.data
      setFormError(
        data ? Object.values(data).flat().join(' ') : 'Failed to create branch.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const companyName = (id) => companies.find((c) => c.id === id)?.name ?? id

  const startEdit = (b) => {
    setEditingId(b.id)
    setEditData({ name: b.name, branch_code: b.branch_code, state: b.state || '', district: b.district || '' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = async (id) => {
    try {
      await updateBranch(id, editData)
      setEditingId(null)
      loadData()
    } catch  {
      alert('Failed to save changes.')
    }
  }

  const toggleStatus = async (b) => {
    const nextStatus = b.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await updateBranch(b.id, { status: nextStatus })
      loadData()
    } catch  {
      alert('Failed to update status.')
    }
  }

  const filteredBranches = branches.filter((b) => {
    const q = search.toLowerCase()
    return (
      b.name.toLowerCase().includes(q) ||
      b.branch_code.toLowerCase().includes(q) ||
      companyName(b.company).toLowerCase().includes(q)
    )
  })

  return (
    <div className="container mt-4">
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="stat-card bg-teal">
            <div className="stat-icon">📍</div>
            <div className="stat-label">Total Branches</div>
            <div className="stat-value">{branches.length}</div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="stat-card bg-pink">
            <div className="stat-icon">✅</div>
            <div className="stat-label">Active</div>
            <div className="stat-value">{branches.filter((b) => b.status === 'ACTIVE').length}</div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h2 className="mb-0">Branches</h2>
          <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>
            Manage the branches under your companies
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ New Branch'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card card-body mb-4">
          {formError && <div className="alert alert-danger">{formError}</div>}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Company</label>
              <select
                className="form-select"
                name="company"
                value={formData.company}
                onChange={handleChange}
                required
              >
                <option value="">-- Select --</option>
                {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name || c.name}</option>
                ))}
              </select>
              <div className="form-text">Select the Main Company or Sub Company for this branch.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label">Branch Code</label>
              <input
                className="form-control"
                name="branch_code"
                value={formData.branch_code}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Name</label>
              <input
                className="form-control"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">State</label>
              <input
                className="form-control"
                name="state"
                value={formData.state}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">District</label>
              <input
                className="form-control"
                name="district"
                value={formData.district}
                onChange={handleChange}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-success mt-3" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Branch'}
          </button>
        </form>
      )}

      {!loading && !error && branches.length > 0 && (
        <div className="mb-3">
          <input
            type="text"
            className="form-control"
            style={{ maxWidth: '320px' }}
            placeholder="🔍 Search branches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading && <p className="text-muted">Loading branches...</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && branches.length === 0 && (
        <div className="text-center py-5 chart-card">
          <div style={{ fontSize: '2.5rem' }}>📍</div>
          <h5 className="mt-2">No branches yet</h5>
          <p className="text-muted">Create your first branch to get started.</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Branch</button>
        </div>
      )}

      {!loading && !error && branches.length > 0 && (
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Company</th>
              <th>State</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBranches.map((b) => (
              <tr key={b.id}>
                <td>
                  {editingId === b.id ? (
                    <div className="d-flex gap-2">
                      <input className="form-control form-control-sm" style={{ maxWidth: 100 }} value={editData.branch_code}
                        onChange={(e) => setEditData({ ...editData, branch_code: e.target.value })} placeholder="Code" />
                      <input className="form-control form-control-sm" value={editData.name}
                        onChange={(e) => setEditData({ ...editData, name: e.target.value })} placeholder="Name" />
                    </div>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <span
                        style={{
                          width: 34, height: 34, borderRadius: 8,
                          background: 'linear-gradient(135deg, #14b8a6, #0f766e)',
                          color: '#fff', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700,
                        }}
                      >
                        {b.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{b.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>{b.branch_code}</div>
                      </div>
                    </div>
                  )}
                </td>
                <td>{companyName(b.company)}</td>
                <td>
                  {editingId === b.id ? (
                    <input className="form-control form-control-sm" value={editData.state}
                      onChange={(e) => setEditData({ ...editData, state: e.target.value })} />
                  ) : (b.state || '-')}
                </td>
                <td>
                  <span className={`badge ${b.status === 'ACTIVE' ? 'bg-success' : 'bg-secondary'}`}>
                    {b.status}
                  </span>
                </td>
                <td>
                  {editingId === b.id ? (
                    <div className="d-flex gap-1">
                      <button className="btn btn-success btn-sm" onClick={() => saveEdit(b.id)}>Save</button>
                      <button className="btn btn-outline-secondary btn-sm" onClick={cancelEdit}>Cancel</button>
                    </div>
                  ) : (
                    <div className="d-flex gap-1">
                      <button className="btn btn-outline-primary btn-sm" onClick={() => startEdit(b)}>Edit</button>
                      <button
                        className={`btn btn-sm ${b.status === 'ACTIVE' ? 'btn-outline-danger' : 'btn-outline-success'}`}
                        onClick={() => toggleStatus(b)}
                      >
                        {b.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filteredBranches.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center text-muted py-4">No branches match your search.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}