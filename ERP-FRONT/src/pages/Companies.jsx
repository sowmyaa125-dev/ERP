import { useEffect, useState } from 'react'
import { getCompanies, updateCompany } from '../api/companies'
import { useAuth } from '../context/AuthContext'
import RegisterCompanyModal from '../components/RegisterCompanyModal'
import AddCompanyModal from '../components/AddCompanyModal'
import CredentialsModal from '../components/CredentialsModal'

const LEVEL_BADGE = {
  REGISTERED: ['Registered', 'bg-success'],
  MAIN: ['Main', 'bg-primary'],
  SUB: ['Sub', 'bg-secondary'],
}


export default function Companies() {
  const { user } = useAuth()
  // SUPER = Super Admin; REGISTERED / MAIN / SUB = level of the user's own company.
  const level = user?.is_super_admin ? 'SUPER' : user?.company_level
  const canAdd = ['SUPER', 'REGISTERED', 'MAIN'].includes(level)

  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [credentials, setCredentials] = useState(null) // shown once after registering

  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const loadCompanies = () => {
    setLoading(true)
    getCompanies()
      .then((res) => setCompanies(res.data))
      .catch(() => setError('Failed to load companies.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCompanies()
  }, [])

  const mainCompanies = companies.filter((c) => c.company_type === 'MAIN')

  const openRegister = () => setShowRegister(true)

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditData({ name: c.name, email: c.email, phone: c.phone || '' })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditData({})
  }

  const saveEdit = async (id) => {
    try {
      await updateCompany(id, editData)
      setEditingId(null)
      loadCompanies()
    } catch {
      alert('Failed to save changes.')
    }
  }

  const toggleStatus = async (c) => {
    const nextStatus = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await updateCompany(c.id, { status: nextStatus })
      loadCompanies()
    } catch {
      alert('Failed to update status.')
    }
  }

  const filteredCompanies = companies.filter((c) => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      || (c.parent_company_name || '').toLowerCase().includes(q)
  })

  return (
    <div className="container mt-4">
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="stat-card bg-indigo">
            <div className="stat-icon">🏢</div>
            <div className="stat-label">Total Companies</div>
            <div className="stat-value">{companies.length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-teal">
            <div className="stat-icon">🏭</div>
            <div className="stat-label">Main Companies</div>
            <div className="stat-value">{mainCompanies.length}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="stat-card bg-orange">
            <div className="stat-icon">🏬</div>
            <div className="stat-label">Sub Companies</div>
            <div className="stat-value">{companies.filter((c) => c.company_type === 'SUB').length}</div>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h2 className="mb-0">Companies</h2>
          <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>
            {level === 'SUPER' ? 'Super Admin · all registered companies' : `Your company: ${user?.company_name || 'Not assigned'}`}
          </p>
        </div>
        <div className="d-flex gap-2">
          {canAdd && <button className={`btn ${level === 'SUPER' ? 'btn-outline-primary' : 'btn-primary'}`} onClick={() => setShowForm(true)}>+ Add Company</button>}
          {level === 'SUPER' && <button className="btn btn-primary" onClick={openRegister}>+ Register Company</button>}
        </div>
      </div>

      {!loading && !error && companies.length > 0 && (
        <div className="mb-3">
          <input
            type="text" className="form-control" style={{ maxWidth: '320px' }}
            placeholder="🔍 Search companies..." value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {!canAdd && (
        <div className="alert alert-info">
          {level === 'SUB'
            ? 'Sub company accounts cannot add companies. Ask your Main or registered company to add them.'
            : 'This account is not linked to a company, so it cannot add companies. If this is the administrator account, '
              + 'run "python manage.py migrate" on the server and sign in again to get Super Admin access.'}
        </div>
      )}

      {loading && <p className="text-muted">Loading companies...</p>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && companies.length === 0 && (
        <div className="text-center py-5 chart-card">
          <div style={{ fontSize: '2.5rem' }}>🏢</div>
          <h5 className="mt-2">No companies yet</h5>
          {level === 'SUPER' && (
            <>
              <p className="text-muted">Register a company to give it a login.</p>
              <button className="btn btn-primary" onClick={openRegister}>+ Register Company</button>
            </>
          )}
        </div>
      )}

      {!loading && !error && companies.length > 0 && (
        <div className="table-responsive">
          <table className="table table-striped">
            <thead>
              <tr>
                <th>Company</th>
                <th>Type</th>
                <th>Parent / Group</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((c) => {
                const [badgeLabel, badgeClass] = LEVEL_BADGE[c.level] || [c.company_type, 'bg-secondary']
                const indent = c.company_type === 'SUB' ? (c.parent_company === c.owner ? 1 : 2) : c.owner ? 1 : 0
                return (
                  <tr key={c.id}>
                    <td>
                      {editingId === c.id ? (
                        <input className="form-control form-control-sm" value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                      ) : (
                        <div className="d-flex align-items-center gap-2" style={{ paddingLeft: indent * 22 }}>
                          {indent > 0 && <span className="text-muted">↳</span>}
                          <span
                            style={{
                              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                              background: c.company_type === 'MAIN'
                                ? 'linear-gradient(135deg, #16a34a, #14532d)'
                                : 'linear-gradient(135deg, #1f2937, #000000)',
                              color: '#fff', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700,
                            }}
                          >
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          {c.id === user?.company && <span className="badge bg-success">Current</span>}
                        </div>
                      )}
                    </td>
                    <td><span className={`badge ${badgeClass}`}>{badgeLabel}</span></td>
                    <td className="text-muted small">
                      {c.company_type === 'SUB' ? `Sub of ${c.parent_company_name}` : c.owner_name ? `Group: ${c.owner_name}` : '—'}
                    </td>
                    <td>
                      {editingId === c.id ? (
                        <input className="form-control form-control-sm" value={editData.email}
                          onChange={(e) => setEditData({ ...editData, email: e.target.value })} />
                      ) : c.email}
                    </td>
                    <td>
                      {editingId === c.id ? (
                        <input className="form-control form-control-sm" value={editData.phone}
                          onChange={(e) => setEditData({ ...editData, phone: e.target.value })} />
                      ) : (c.phone || '-')}
                    </td>
                    <td>
                      <span className={`badge ${c.status === 'ACTIVE' ? 'bg-success' : 'bg-secondary'}`}>{c.status}</span>
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
                )
              })}
              {filteredCompanies.length === 0 && (
                <tr><td colSpan="7" className="text-center text-muted py-4">No companies match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ----- New Main / Sub company (registered or main company users) ----- */}
      {showForm && (
        <AddCompanyModal
          level={level} companies={companies} ownCompanyId={user?.company}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadCompanies() }}
        />
      )}

      {showRegister && (
        <RegisterCompanyModal
          onClose={() => setShowRegister(false)}
          onRegistered={(creds) => { setShowRegister(false); setCredentials(creds); loadCompanies() }}
        />
      )}

      {credentials && <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />}
    </div>
  )
}
