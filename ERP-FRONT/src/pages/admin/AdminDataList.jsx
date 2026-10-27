import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/Modal'
import AddCompanyModal from '../../components/AddCompanyModal'
import { getAdminCompanies } from '../../api/admin'
import AdminDataForm from './AdminDataForm'
import { getChangeList, runAction } from '../../api/adminData'
import { errorMessage } from '../../utils/format'
import { dataPath } from './AdminDataIndex'

const BADGE_WORDS = {
  active: 'bg-success', approved: 'bg-success', paid: 'bg-success', received: 'bg-success',
  pending: 'bg-warning text-dark', partially_paid: 'bg-warning text-dark', draft: 'bg-secondary',
  inactive: 'bg-secondary', cancelled: 'bg-dark', rejected: 'bg-danger', unpaid: 'bg-danger',
}

export function Cell({ value, asBadge = false }) {
  if (value && 'bool' in value) {
    if (value.bool === null) return <span className="text-muted">—</span>
    return value.bool
      ? <span className="badge bg-success-subtle text-success-emphasis">Yes</span>
      : <span className="badge bg-secondary-subtle text-secondary-emphasis">No</span>
  }
  if (value?.url) return <a href={value.url} target="_blank" rel="noreferrer">{value.text}</a>
  const badge = asBadge && BADGE_WORDS[String(value?.text || '').toLowerCase().replaceAll(' ', '_')]
  if (badge) return <span className={`badge ${badge}`}>{value.text}</span>
  return <>{value?.text}</>
}

export function AdminBreadcrumb({ items }) {
  return (
    <nav aria-label="breadcrumb">
      <ol className="breadcrumb small mb-2 adm-breadcrumb">
        <li className="breadcrumb-item"><Link to="/admin-dashboard">Admin Dashboard</Link></li>
        {items.map((it, i) => (
          <li key={i} className={`breadcrumb-item ${it.to ? '' : 'active'}`}>
            {it.to ? <Link to={it.to}>{it.label}</Link> : it.label}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** List page for any model in Django's admin: search, filters, sorting, paging and bulk actions. */
export default function AdminDataList() {
  const { user } = useAuth()
  const { app, model } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [selected, setSelected] = useState([])
  const [preview, setPreview] = useState(null) // { action, ...summary }
  const [message, setMessage] = useState(location.state?.message || '')
  const [reloadKey, setReloadKey] = useState(0)
  const [adding, setAdding] = useState(false)
  const [groupCompanies, setGroupCompanies] = useState(null) // for the Add Company pop-up

  const paramsKey = searchParams.toString()

  useEffect(() => {
    if (!user?.is_super_admin) return
    getChangeList(app, model, Object.fromEntries(new URLSearchParams(paramsKey)))
      .then((res) => { setData(res.data); setError(''); setSelected([]) })
      .catch((err) => setError(errorMessage(err, 'Failed to load.')))
  }, [app, model, paramsKey, reloadKey, user])

  if (!user?.is_super_admin) return <Navigate to="/" replace />

  // Companies use the dedicated Add Company pop-up (group / parent rules); every other model uses its admin form.
  const isCompanyModel = app === 'companies' && model === 'company'
  const openAdd = () => {
    setAdding(true)
    if (isCompanyModel) getAdminCompanies().then((res) => setGroupCompanies(res.data)).catch(() => setGroupCompanies([]))
  }
  const closeAdd = () => {
    setAdding(false)
    setGroupCompanies(null)
  }
  const added = (msg) => {
    setMessage(msg)
    setReloadKey((k) => k + 1)
  }

  const current = Object.fromEntries(new URLSearchParams(paramsKey))
  const setParams = (next) => setSearchParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== null && v !== '' && v !== undefined)))
  const filterKeys = Object.keys(current).filter((k) => !['q', 'o', 'p'].includes(k))

  const sortBy = (col) => {
    if (!col.sortable) return
    setParams({ ...current, o: col.sorted === 'asc' ? `-${col.index}` : String(col.index), p: null })
  }

  const doSearch = (e) => {
    e.preventDefault()
    setParams({ ...current, q: query, p: null })
  }

  const runBulk = async (action, confirm = false) => {
    setMessage('')
    try {
      const res = await runAction(app, model, { action, ids: selected, confirm })
      if (res.data.preview) {
        setPreview({ action, ...res.data })
        return
      }
      setPreview(null)
      setMessage(res.data.detail)
      setReloadKey((k) => k + 1)
    } catch (err) {
      if (err.response?.status === 409) setPreview({ action, ...err.response.data })
      else setError(errorMessage(err))
    }
  }

  if (error && !data) return <div className="container mt-4"><div className="alert alert-danger">{error}</div></div>
  if (!data) return <div className="container mt-4 text-muted">Loading…</div>

  const canSelect = data.actions.length > 0
  const allSelected = data.rows.length > 0 && selected.length === data.rows.length
  const toggleAll = () => setSelected(allSelected ? [] : data.rows.map((r) => r.pk))
  const statusCol = data.columns.findIndex((c) => ['status', 'approval_status', 'payment_status'].includes(c.name))
  const { page, pages } = data.pagination

  return (
    <div className="container mt-4 adm-page">
      <AdminBreadcrumb items={[{ label: data.name }]} />

      <div className="adm-page-header">
        <div className="adm-page-icon">{(data.name[0] || '?').toUpperCase()}</div>
        <div className="flex-grow-1">
          <h2 className="mb-0">{data.name}</h2>
          <p className="text-muted mb-0 small">
            {data.pagination.total} {data.pagination.total === 1 ? data.name_singular.toLowerCase() : data.name.toLowerCase()} in total
            {!data.perms.add && !data.perms.change && ' · view only'}
          </p>
        </div>
        {data.perms.add && (
          <button className="btn btn-primary" onClick={openAdd}>+ New {data.name_singular.toLowerCase()}</button>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success alert-dismissible">{message}<button type="button" className="btn-close" onClick={() => setMessage('')} /></div>}
      {!data.perms.add && !data.perms.change && (
        <div className="alert alert-secondary py-2 small">
          View only. These records are created and changed by the app&apos;s own screens so stock and balances stay correct.
        </div>
      )}

      {(data.search.enabled || data.filters.length > 0) && (
        <div className="card adm-toolbar mb-3">
          <div className="card-body d-flex flex-wrap gap-2 align-items-center">
            {data.search.enabled && (
              <form onSubmit={doSearch} className="adm-search">
                <span className="adm-search-icon">🔍</span>
                <input className="form-control" placeholder={`Search ${data.name.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
              </form>
            )}
            {data.filters.map((f) => {
              const active = f.choices.findIndex((c) => c.selected)
              return (
                <select key={f.title} className={`form-select adm-filter ${active > 0 ? 'is-active' : ''}`} value={active < 0 ? 0 : active}
                  onChange={(e) => setSearchParams(f.choices[Number(e.target.value)].params)}>
                  {f.choices.map((c, i) => (
                    <option key={i} value={i}>{i === 0 ? `${f.title.replace(/^./, (x) => x.toUpperCase())}: ${c.display}` : c.display}</option>
                  ))}
                </select>
              )
            })}
            {(filterKeys.length > 0 || current.q) && (
              <button className="btn btn-link btn-sm" onClick={() => { setQuery(''); setParams({ o: current.o }) }}>Clear filters</button>
            )}
          </div>
        </div>
      )}

      {canSelect && selected.length > 0 && (
        <div className="adm-bulkbar">
          <span><strong>{selected.length}</strong> selected</span>
          <div className="d-flex gap-2">
            {data.actions.map((a) => (
              <button key={a.name} className={`btn btn-sm ${a.name === 'delete_selected' ? 'btn-danger' : 'btn-light'}`} onClick={() => runBulk(a.name)}>
                {a.name === 'delete_selected' ? '🗑 Delete selected' : a.description}
              </button>
            ))}
            <button className="btn btn-sm btn-outline-light" onClick={() => setSelected([])}>Clear</button>
          </div>
        </div>
      )}

      <div className="card adm-table-card">
        <div className="table-responsive">
          <table className="table align-middle mb-0 adm-table">
            <thead>
              <tr>
                {canSelect && (
                  <th style={{ width: 40 }}>
                    <input type="checkbox" className="form-check-input" aria-label="Select all" checked={allSelected} onChange={toggleAll} />
                  </th>
                )}
                {data.columns.map((c) => (
                  <th key={c.index} onClick={() => sortBy(c)} className={`${c.sortable ? 'adm-sortable' : ''} ${c.sorted ? 'is-sorted' : ''}`}>
                    {c.label}
                    {c.sortable && <span className="adm-sort-icon">{c.sorted === 'asc' ? '▲' : c.sorted === 'desc' ? '▼' : '↕'}</span>}
                  </th>
                ))}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.pk} className={selected.includes(r.pk) ? 'is-selected' : ''} onClick={() => navigate(dataPath(app, model, r.pk))}>
                  {canSelect && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="form-check-input" aria-label={`Select ${r.str}`} checked={selected.includes(r.pk)}
                        onChange={() => setSelected(selected.includes(r.pk) ? selected.filter((x) => x !== r.pk) : [...selected, r.pk])} />
                    </td>
                  )}
                  {r.values.map((v, i) => (
                    <td key={i} className={i === 0 ? 'fw-semibold' : ''}><Cell value={v} asBadge={i === statusCol} /></td>
                  ))}
                  <td className="text-end text-muted">›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length === 0 && (
          <div className="text-center py-5">
            <div style={{ fontSize: '2rem' }}>🗂</div>
            <h6 className="mt-2 mb-1">No {data.name.toLowerCase()} found</h6>
            <p className="text-muted small mb-3">{filterKeys.length || current.q ? 'Try clearing the search or filters.' : 'Nothing has been added yet.'}</p>
            {data.perms.add && <button className="btn btn-primary btn-sm" onClick={openAdd}>+ New {data.name_singular.toLowerCase()}</button>}
          </div>
        )}
      </div>

      <div className="d-flex justify-content-between align-items-center mt-3 mb-4 small text-muted flex-wrap gap-2">
        <span>
          Showing {data.rows.length} of {data.pagination.count}
          {data.pagination.count !== data.pagination.total && ` (filtered from ${data.pagination.total})`}
        </span>
        {pages > 1 && (
          <ul className="pagination pagination-sm mb-0">
            <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => setParams({ ...current, p: page - 1 > 1 ? String(page - 1) : null })}>‹</button>
            </li>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
              .map((p) => (
                <li key={p} className={`page-item ${p === page ? 'active' : ''}`}>
                  <button className="page-link" onClick={() => setParams({ ...current, p: p === 1 ? null : String(p) })}>{p}</button>
                </li>
              ))}
            <li className={`page-item ${page >= pages ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => setParams({ ...current, p: String(page + 1) })}>›</button>
            </li>
          </ul>
        )}
      </div>

      {adding && isCompanyModel && groupCompanies && (
        <AddCompanyModal
          level="SUPER" companies={groupCompanies}
          onClose={closeAdd}
          onSaved={(company) => { closeAdd(); added(`The company “${company.name}” was added successfully.`) }}
        />
      )}
      {adding && !isCompanyModel && (
        <Modal title={`New ${data.name_singular.toLowerCase()}`} size="xl" onClose={closeAdd}>
          <AdminDataForm embedded={{ app, model, onClose: closeAdd, onSaved: added }} />
        </Modal>
      )}

      {preview && (
        <Modal title={`Delete ${selected.length} ${selected.length === 1 ? data.name_singular.toLowerCase() : data.name.toLowerCase()}?`} onClose={() => setPreview(null)}
          footer={(
            <>
              <button className="btn btn-outline-secondary" onClick={() => setPreview(null)}>Cancel</button>
              {!preview.protected?.length && !preview.perms_needed?.length && (
                <button className="btn btn-danger" onClick={() => runBulk(preview.action, true)}>Yes, delete</button>
              )}
            </>
          )}>
          <DeleteSummary summary={preview} />
        </Modal>
      )}
    </div>
  )
}

export function DeleteSummary({ summary }) {
  if (summary.protected?.length) {
    return (
      <>
        <div className="alert alert-warning">This can&apos;t be deleted because other records still use it:</div>
        <ul className="small mb-0">{summary.protected.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </>
    )
  }
  if (summary.perms_needed?.length) {
    return <div className="alert alert-warning mb-0">Your account doesn&apos;t have permission to delete: {summary.perms_needed.join(', ')}.</div>
  }
  return (
    <>
      <p>
        {summary.object ? <>“<strong>{summary.object}</strong>” and everything linked to it will be permanently deleted.</>
          : 'The selected records and everything linked to them will be permanently deleted.'}
      </p>
      <div className="form-label">What will be deleted</div>
      <ul className="small mb-0">
        {Object.entries(summary.model_count || {}).map(([name, count]) => <li key={name}>{count} × {name}</li>)}
      </ul>
    </>
  )
}
