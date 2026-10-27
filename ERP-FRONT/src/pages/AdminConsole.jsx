import { useCallback, useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import RegisterCompanyModal from '../components/RegisterCompanyModal'
import CredentialsModal from '../components/CredentialsModal'
import AddCompanyModal from '../components/AddCompanyModal'
import RecentChanges from './admin/AdminDataIndex'
import {
  approveRegistration, createAdminUser, getAdminCompanies, getAdminSummary, getAdminUsers,
  getPendingRegistrations, rejectRegistration, resetUserPassword, setCompanyStatus, updateAdminUser,
} from '../api/admin'
import { errorMessage, shortDate } from '../utils/format'

const TABS = [
  { key: 'companies', label: 'Companies' },
  { key: 'users', label: 'Users' },
  { key: 'pending', label: 'Pending approvals' },
  { key: 'recent', label: 'Recent changes' },
]
const LEVEL_BADGE = { REGISTERED: ['Registered', 'bg-success'], MAIN: ['Main', 'bg-primary'], SUB: ['Sub', 'bg-secondary'] }

const lastSeen = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never')

/** Super Admin console: every registered company, every user, and self-registrations awaiting approval. */
export default function AdminConsole() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'companies'
  const setTab = (key) => setSearchParams(key === 'companies' ? {} : { tab: key })
  const [summary, setSummary] = useState(null)
  const [companies, setCompanies] = useState([])
  const [pending, setPending] = useState([])
  const [userFilter, setUserFilter] = useState({ company: '', status: '', search: '' })
  const [credentials, setCredentials] = useState(null)
  const [showRegister, setShowRegister] = useState(false)
  const [addCompany, setAddCompany] = useState(null) // preset for AddCompanyModal, or null
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
    Promise.all([getAdminSummary(), getAdminCompanies(), getPendingRegistrations()])
      .then(([s, c, p]) => {
        setSummary(s.data)
        setCompanies(c.data)
        setPending(p.data)
        setError('')
      })
      .catch((err) => setError(errorMessage(err, 'Failed to load the admin console.')))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.is_super_admin) reload()
  }, [reload, user])

  if (!user?.is_super_admin) return <Navigate to="/" replace />

  const showUsersOf = (companyId) => {
    setUserFilter({ company: String(companyId), status: '', search: '' })
    setTab('users')
  }

  const cards = [
    ['Registered companies', summary?.registered_companies, 'bg-indigo', '🏢', `${summary?.companies ?? '…'} incl. main & sub`],
    ['Users', summary?.users, 'bg-teal', '👥', `${summary?.active_users ?? '…'} active`],
    ['Pending approvals', summary?.pending_approvals, 'bg-orange', '⏳', 'Self-registrations'],
    ['Awaiting password change', summary?.awaiting_password_change, 'bg-pink', '🔑', 'Temporary passwords not yet replaced'],
  ]

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h2 className="mb-0">Admin Dashboard</h2>
          <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>Super Admin · all companies and users</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary" onClick={() => setAddCompany({})}>+ Add Company</button>
          <button className="btn btn-primary" onClick={() => setShowRegister(true)}>+ Register Company</button>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {cards.map(([label, value, bg, icon, sub]) => (
          <div className="col-md-3" key={label}>
            <div className={`stat-card ${bg}`}>
              <div className="stat-icon">{icon}</div>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value ?? '…'}</div>
              <div className="stat-sub">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key === 'pending' && pending.length > 0 && <span className="badge bg-danger ms-1">{pending.length}</span>}
            </button>
          </li>
        ))}
      </ul>

      {error && <div className="alert alert-danger">{error}</div>}

      {tab === 'companies' && (
        <CompaniesTab companies={companies} onChanged={reload} onShowUsers={showUsersOf}
          onShowPending={() => setTab('pending')} onCredentials={setCredentials} onAdd={setAddCompany} />
      )}
      {tab === 'users' && (
        <UsersTab companies={companies} filter={userFilter} setFilter={setUserFilter} currentUserId={user.id}
          reloadKey={reloadKey} onChanged={reload} onCredentials={setCredentials} />
      )}
      {tab === 'pending' && <PendingTab pending={pending} onChanged={reload} />}
      {tab === 'recent' && <RecentChanges />}

      {showRegister && (
        <RegisterCompanyModal
          onClose={() => setShowRegister(false)}
          onRegistered={(creds) => { setShowRegister(false); setCredentials(creds); reload() }}
        />
      )}
      {addCompany && (
        <AddCompanyModal
          level="SUPER" companies={companies} initial={addCompany}
          onClose={() => setAddCompany(null)}
          onSaved={() => { setAddCompany(null); reload() }}
        />
      )}
      {credentials && <CredentialsModal credentials={credentials} onClose={() => setCredentials(null)} />}
    </div>
  )
}

async function confirmAndRun(message, fn, onDone) {
  if (message && !window.confirm(message)) return
  try {
    const res = await fn()
    onDone?.(res)
  } catch (err) {
    alert(errorMessage(err))
  }
}

function resetPassword(target, onCredentials, onChanged) {
  confirmAndRun(
    `Reset the password for ${target.email}? They will be signed out and must set a new password (with an email code) at next sign-in.`,
    () => resetUserPassword(target.id),
    (res) => {
      onCredentials({
        title: 'Password reset', intro: `New temporary login for ${target.email}:`,
        ...res.data.credentials, emailSent: res.data.email_sent,
      })
      onChanged()
    },
  )
}

function CompaniesTab({ companies, onChanged, onShowUsers, onShowPending, onCredentials, onAdd }) {
  const [search, setSearch] = useState('')
  const q = search.toLowerCase()
  const groupOf = (c) => companies.find((x) => x.id === (c.owner || (c.company_type === 'SUB' ? c.parent_company : c.id)))
  const visible = companies.filter((c) => !q || c.name.toLowerCase().includes(q) || (groupOf(c)?.name || '').toLowerCase().includes(q)
    || (c.admin_user?.email || '').toLowerCase().includes(q))

  const toggle = (c) => {
    const deactivate = c.status === 'ACTIVE'
    const scope = c.level === 'REGISTERED'
      ? `all users of ${c.name} and every company in its group`
      : `all users of ${c.name}`
    confirmAndRun(
      deactivate ? `Deactivate ${c.name}? This signs out and blocks ${scope}.` : `Re-activate ${c.name}?`,
      () => setCompanyStatus(c.id, deactivate ? 'INACTIVE' : 'ACTIVE'),
      onChanged,
    )
  }

  return (
    <>
      <input className="form-control mb-3" style={{ maxWidth: 320 }} placeholder="🔍 Search company, group or admin email…"
        value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="table-responsive">
        <table className="table table-striped align-middle">
          <thead>
            <tr><th>Company</th><th>Type</th><th>Admin login</th><th className="text-end">Users</th><th>Created</th><th>Status</th><th className="text-end">Actions</th></tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const [badge, badgeClass] = LEVEL_BADGE[c.level] || [c.company_type, 'bg-secondary']
              const indent = c.company_type === 'SUB' ? (c.parent_company === c.owner || !c.owner ? 1 : 2) : c.owner ? 1 : 0
              const admin = c.admin_user
              return (
                <tr key={c.id}>
                  <td>
                    <div style={{ paddingLeft: indent * 22 }} className="d-flex align-items-center gap-2">
                      {indent > 0 && <span className="text-muted">↳</span>}
                      <div>
                        <div className="fw-semibold">{c.name}</div>
                        <div className="small text-muted">{c.email}{c.gst_number ? ` · GSTIN ${c.gst_number}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge ${badgeClass}`}>{badge}</span></td>
                  <td>
                    {admin ? (
                      <>
                        <div className="small">{admin.email}</div>
                        <div className="small text-muted">
                          {!admin.is_active ? <span className="text-danger">Inactive</span>
                            : admin.must_change_password ? <span className="text-warning-emphasis">Awaiting first password change</span>
                              : `Last sign-in: ${lastSeen(admin.last_login)}`}
                        </div>
                      </>
                    ) : <span className="text-muted small">—</span>}
                  </td>
                  <td className="text-end">
                    <button className="btn btn-link btn-sm p-0" onClick={() => onShowUsers(c.id)}>
                      {c.active_user_count}/{c.user_count}
                    </button>
                  </td>
                  <td className="small">{shortDate(c.created_at)}</td>
                  <td><span className={`badge ${c.status === 'ACTIVE' ? 'bg-success' : c.status === 'PENDING' ? 'bg-warning text-dark' : 'bg-secondary'}`}>{c.status}</span></td>
                  <td className="text-end text-nowrap">
                    {c.awaiting_approval ? (
                      // Self-registrations are activated through approval, not here.
                      <button className="btn btn-sm btn-outline-warning" onClick={onShowPending}>Review in Pending approvals</button>
                    ) : (
                      <>
                        {c.company_type === 'MAIN' && !['INACTIVE', 'REJECTED'].includes(c.status) && (
                          <button
                            className="btn btn-sm btn-outline-success me-1"
                            title={c.level === 'REGISTERED' ? `Add a Main or Sub company to ${c.name}'s group` : `Add a Sub company under ${c.name}`}
                            onClick={() => onAdd(c.level === 'REGISTERED'
                              ? { company_type: 'MAIN', group: String(c.id), parent_company: String(c.id) }
                              : { company_type: 'SUB', parent_company: String(c.id) })}
                          >
                            + Add
                          </button>
                        )}
                        {admin && (
                          <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => resetPassword(admin, onCredentials, onChanged)}>
                            Reset admin password
                          </button>
                        )}
                        <button className={`btn btn-sm ${c.status === 'ACTIVE' ? 'btn-outline-danger' : 'btn-outline-success'}`} onClick={() => toggle(c)}>
                          {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && <tr><td colSpan="7" className="text-center text-muted py-4">No companies.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

const emptyUser = { email: '', first_name: '', last_name: '', designation: '', company: '', password: '' }

function UsersTab({ companies, filter, setFilter, currentUserId, reloadKey, onChanged, onCredentials }) {
  const [users, setUsers] = useState(null)
  const [form, setForm] = useState(null) // { id?, values }
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v))
    const t = setTimeout(() => {
      getAdminUsers(params).then((res) => setUsers(res.data)).catch(() => setUsers([]))
    }, filter.search ? 250 : 0)
    return () => clearTimeout(t)
  }, [filter, reloadKey])

  const setF = (name, value) => setFilter((f) => ({ ...f, [name]: value }))

  const toggleActive = (u) => confirmAndRun(
    u.is_active ? `Deactivate ${u.email}? They will be signed out immediately.` : `Re-activate ${u.email}?`,
    () => updateAdminUser(u.id, { is_active: !u.is_active }),
    onChanged,
  )

  const save = async (e) => {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      if (form.id) {
        const { password, email, ...rest } = form.values
        await updateAdminUser(form.id, { ...rest, email, company: rest.company || null })
        setForm(null)
      } else {
        const res = await createAdminUser(form.values)
        setForm(null)
        onCredentials({
          title: 'User created', intro: `${res.data.user.email} can now sign in with:`,
          ...res.data.credentials, emailSent: res.data.email_sent,
        })
      }
      onChanged()
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save user.'))
    } finally {
      setSaving(false)
    }
  }

  const setV = (name, value) => setForm((f) => ({ ...f, values: { ...f.values, [name]: value } }))

  return (
    <>
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <input className="form-control" style={{ maxWidth: 260 }} placeholder="🔍 Search name, email, company…"
          value={filter.search} onChange={(e) => setF('search', e.target.value)} />
        <select className="form-select" style={{ maxWidth: 280 }} value={filter.company} onChange={(e) => setF('company', e.target.value)}>
          <option value="">All companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 220 }} value={filter.status} onChange={(e) => setF('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="password_change">Awaiting password change</option>
        </select>
        <button className="btn btn-primary ms-auto" onClick={() => { setFormError(''); setForm({ values: { ...emptyUser, company: filter.company } }) }}>
          + New User
        </button>
      </div>

      {!users ? <p className="text-muted">Loading users...</p> : (
        <div className="table-responsive">
          <table className="table table-striped align-middle">
            <thead>
              <tr><th>User</th><th>Company</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="text-end">Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="fw-semibold">{u.full_name}{u.is_super_admin && <span className="badge bg-dark ms-1">Super Admin</span>}</div>
                    <div className="small text-muted">{u.email}{u.designation ? ` · ${u.designation}` : ''}</div>
                  </td>
                  <td>
                    <div>{u.company_name || '—'}</div>
                    {u.group_name && u.group_name !== u.company_name && <div className="small text-muted">Group: {u.group_name}</div>}
                  </td>
                  <td className="small">{u.role_name || '—'}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'bg-success' : 'bg-secondary'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    {u.approval_status === 'PENDING' && <span className="badge bg-warning text-dark ms-1">Pending approval</span>}
                    {u.is_active && u.must_change_password && <span className="badge bg-warning text-dark ms-1">Password change due</span>}
                  </td>
                  <td className="small">{lastSeen(u.last_login)}</td>
                  <td className="text-end text-nowrap">
                    {!u.is_super_admin && (
                      <>
                        <button className="btn btn-sm btn-outline-primary me-1" onClick={() => {
                          setFormError('')
                          setForm({ id: u.id, values: { email: u.email, first_name: u.first_name, last_name: u.last_name, designation: u.designation || '', company: u.company || '' } })
                        }}>Edit</button>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => resetPassword(u, onCredentials, onChanged)}>Reset password</button>
                      </>
                    )}
                    {u.id !== currentUserId && (
                      <button className={`btn btn-sm ${u.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`} onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan="6" className="text-center text-muted py-4">No users match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Edit User' : 'New User'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            {formError && <div className="alert alert-danger">{formError}</div>}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">First name</label>
                <input className="form-control" value={form.values.first_name} onChange={(e) => setV('first_name', e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Last name</label>
                <input className="form-control" value={form.values.last_name} onChange={(e) => setV('last_name', e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Login email *</label>
                <input type="email" className="form-control" required value={form.values.email} onChange={(e) => setV('email', e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Designation</label>
                <input className="form-control" value={form.values.designation} onChange={(e) => setV('designation', e.target.value)} />
              </div>
              <div className="col-md-12">
                <label className="form-label">Company *</label>
                <select className="form-select" required value={form.values.company} onChange={(e) => setV('company', e.target.value)}>
                  <option value="">-- Select --</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
                </select>
              </div>
              {!form.id && (
                <div className="col-md-12">
                  <label className="form-label">Temporary password</label>
                  <input className="form-control" autoComplete="off" placeholder="Leave blank to generate one"
                    value={form.values.password} onChange={(e) => setV('password', e.target.value)} />
                  <div className="form-text">Emailed to the user, who must replace it (with an email code) at first sign-in.</div>
                </div>
              )}
            </div>
            <div className="d-flex justify-content-end gap-2 mt-3">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create User'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

function PendingTab({ pending, onChanged }) {
  const approve = (p) => confirmAndRun(
    `Approve ${p.company_name} (${p.email})? They will be able to sign in and will be notified by email.`,
    () => approveRegistration(p.id), onChanged,
  )
  const reject = (p) => {
    const reason = window.prompt(`Reject ${p.company_name}? Optional reason (emailed to ${p.email}):`, '')
    if (reason === null) return
    confirmAndRun(null, () => rejectRegistration(p.id, reason), onChanged)
  }

  return (
    <div className="table-responsive">
      <table className="table table-striped align-middle">
        <thead><tr><th>Company</th><th>Contact</th><th>Registered</th><th>Email</th><th className="text-end">Actions</th></tr></thead>
        <tbody>
          {pending.map((p) => (
            <tr key={p.id}>
              <td className="fw-semibold">{p.company_name}</td>
              <td>{p.email}{p.company_phone ? <div className="small text-muted">{p.company_phone}</div> : null}</td>
              <td className="small">{lastSeen(p.date_joined)}</td>
              <td><span className="badge bg-success">Verified</span></td>
              <td className="text-end text-nowrap">
                <button className="btn btn-sm btn-outline-danger me-1" onClick={() => reject(p)}>Reject</button>
                <button className="btn btn-sm btn-success" onClick={() => approve(p)}>Approve</button>
              </td>
            </tr>
          ))}
          {pending.length === 0 && (
            <tr><td colSpan="5" className="text-center text-muted py-4">No registrations waiting for approval.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
