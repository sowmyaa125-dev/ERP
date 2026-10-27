import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminIndex } from '../../api/adminData'
import { errorMessage } from '../../utils/format'

// Shared by the admin sidebar (AdminSidebarNav) and the admin data pages.
export const dataPath = (app, model, pk) =>
  `/admin-dashboard/data/${app}/${model}${pk === undefined ? '' : `/${pk}`}`

export const APP_ICONS = {
  accounts: '👤', auth: '🔐', companies: '🏢', customers: '🤝', suppliers: '🚚', masters: '🗂',
  products: '📦', stock: '📊', purchases: '🧾', sales: '💰', payments: '💳', token_blacklist: '🔑',
}

/** "Recent changes" tab of the Admin Dashboard: the latest adds/changes/deletes made through the admin pages. */
export default function RecentChanges() {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getAdminIndex()
      .then((res) => setEntries(res.data.recent_actions))
      .catch((err) => setError(errorMessage(err, 'Failed to load recent changes.')))
  }, [])

  if (error) return <div className="alert alert-danger">{error}</div>
  if (!entries) return <p className="text-muted">Loading…</p>

  return (
    <div className="card adm-section adm-page" style={{ maxWidth: 760 }}>
      <div className="adm-section-head"><h6 className="mb-0">Recent changes</h6></div>
      <div className="card-body">
        {entries.length === 0 ? (
          <p className="text-muted small mb-0">No changes yet. Adds, edits and deletes made in the admin pages appear here.</p>
        ) : (
          <ul className="adm-timeline mb-0">
            {entries.map((e) => (
              <li key={e.id} className={`adm-timeline-${e.action.toLowerCase()}`}>
                <div className="small">
                  <strong>{e.action}</strong> {e.model_name?.toLowerCase()}{' '}
                  {e.action !== 'Deleted' && e.app_label ? (
                    <Link to={dataPath(e.app_label, e.model, e.object_id)}>{e.object_repr}</Link>
                  ) : <span>{e.object_repr}</span>}
                </div>
                <div className="small text-muted">
                  {e.user} · {new Date(e.action_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
