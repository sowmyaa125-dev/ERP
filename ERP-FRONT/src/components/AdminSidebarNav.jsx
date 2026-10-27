import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getAdminIndex } from '../api/adminData'
import { APP_ICONS, dataPath } from '../pages/admin/AdminDataIndex'

/**
 * Admin portal sidebar: every page from Django's admin, grouped by app.
 * The group holding the current page opens automatically; others open on click.
 */
export default function AdminSidebarNav() {
  const location = useLocation()
  const [apps, setApps] = useState([])
  const [open, setOpen] = useState({})
  const [filter, setFilter] = useState('')

  // Re-read on each page change so record counts stay current after adds and deletes.
  useEffect(() => {
    getAdminIndex().then((res) => setApps(res.data.apps)).catch(() => {})
  }, [location.pathname])

  // e.g. /admin-dashboard/data/companies/branch/3 -> ['companies', 'branch']
  const [, , , currentApp, currentModel] = location.pathname.split('/')

  useEffect(() => {
    if (currentApp) setOpen((o) => ({ ...o, [currentApp]: true }))
  }, [currentApp])

  const q = filter.toLowerCase()
  const shown = apps
    .map((a) => ({ ...a, models: a.models.filter((m) => !q || m.name.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) }))
    .filter((a) => a.models.length)

  return (
    <>
      <li className="sidebar-section">Data</li>
      <li className="sidebar-search">
        <input className="form-control form-control-sm" placeholder="Find a page…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </li>
      {shown.map((app) => {
        const isOpen = Boolean(q) || open[app.app_label]
        return (
          <li key={app.app_label}>
            <button type="button" className={`sidebar-group ${app.app_label === currentApp ? 'has-active' : ''}`}
              aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [app.app_label]: !isOpen }))}>
              <span className="sidebar-group-icon">{APP_ICONS[app.app_label] || '📁'}</span>
              <span className="flex-grow-1 text-start">{app.name}</span>
              <span className="sidebar-group-caret">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <ul className="sidebar-subnav">
                {app.models.map((m) => (
                  <li key={m.model}>
                    <Link to={dataPath(app.app_label, m.model)}
                      className={`sidebar-sublink ${app.app_label === currentApp && m.model === currentModel ? 'active' : ''}`}>
                      <span className="flex-grow-1">{m.name}</span>
                      {m.count !== null && <span className="sidebar-count">{m.count}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </>
  )
}
