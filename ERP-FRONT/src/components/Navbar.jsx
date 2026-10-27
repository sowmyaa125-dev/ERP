import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { IS_ADMIN_APP, PORTAL } from '../appMode'
import AdminSidebarNav from './AdminSidebarNav'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="app-sidebar">
      <div className="sidebar-portal" style={{ borderColor: PORTAL.accent }}>
        <span>{PORTAL.icon}</span> {PORTAL.name}
      </div>
      

      <nav aria-label="Main navigation">
        <ul className="sidebar-nav">
          {IS_ADMIN_APP ? (
            <>
              <li>
                <Link className={`sidebar-link sidebar-link-admin ${location.pathname === '/admin-dashboard' ? 'active' : ''}`} to="/admin-dashboard">
                  Admin Dashboard
                </Link>
              </li>
              <AdminSidebarNav />
            </>
          ) : (
            <>
              <li><NavLink className="sidebar-link" to="/" end>Dashboard</NavLink></li>
              <li className="sidebar-section">Transactions</li>
              <li><NavLink className="sidebar-link" to="/sales">Sales</NavLink></li>
              <li><NavLink className="sidebar-link" to="/purchases">Purchases</NavLink></li>
              <li><NavLink className="sidebar-link" to="/payments">Payments</NavLink></li>
              <li><NavLink className="sidebar-link" to="/stock">Stock</NavLink></li>
              <li><NavLink className="sidebar-link" to="/reports">Reports</NavLink></li>
              <li className="sidebar-section">Setup</li>
              <li><NavLink className="sidebar-link" to="/customers">Customers</NavLink></li>
              <li><NavLink className="sidebar-link" to="/suppliers">Suppliers</NavLink></li>
              <li><NavLink className="sidebar-link" to="/products">Products</NavLink></li>
              <li><NavLink className="sidebar-link" to="/masters">Masters</NavLink></li>
              <li><NavLink className="sidebar-link" to="/companies">Companies</NavLink></li>
              <li><NavLink className="sidebar-link" to="/branches">Branches</NavLink></li>
            </>
          )}
        </ul>
      </nav>

      {user && (
        <div className="sidebar-account">
          <strong className="sidebar-company" title={user.company_name || 'No company'}>
            {user.is_super_admin ? 'Super Admin' : user.company_name || 'No company'}
          </strong>
          <span className="sidebar-email" title={user.email}>{user.email}</span>
          <button className="btn sidebar-logout" onClick={handleLogout}>Log out</button>
        </div>
      )}
    </aside>
  )
}