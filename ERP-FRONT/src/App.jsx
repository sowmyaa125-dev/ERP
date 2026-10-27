import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Companies from './pages/Companies'
import Branches from './pages/Branches'
import Products from './pages/Products'
import Masters from './pages/Masters'
import Stock from './pages/Stock'
import Customers from './pages/Customers'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import Sales from './pages/Sales'
import InvoicePrint from './pages/InvoicePrint'
import Payments from './pages/Payments'
import Reports from './pages/Reports'
import ChangePassword from './pages/ChangePassword'
import AdminConsole from './pages/AdminConsole'
import AdminDataList from './pages/admin/AdminDataList'
import AdminDataForm from './pages/admin/AdminDataForm'
import { IS_ADMIN_APP, SITE_URLS } from './appMode'

const guard = (page, bare = false) => <ProtectedRoute bare={bare}>{page}</ProtectedRoute>

// Admin pages are served by the admin portal (port 5174); send any old links there.
function ToAdminPortal() {
  window.location.replace(`${SITE_URLS.admin}${window.location.pathname}${window.location.search}`)
  return null
}

// Super Admin portal: npm run dev:admin -> http://localhost:5174
const adminRoutes = (
  <>
    <Route path="/login" element={<Login />} />
    <Route path="/change-password" element={<ChangePassword />} />
    <Route path="/admin-dashboard" element={guard(<AdminConsole />)} />
    <Route path="/admin-dashboard/data" element={<Navigate to="/admin-dashboard" replace />} />
    <Route path="/admin-dashboard/data/:app/:model" element={guard(<AdminDataList />)} />
    <Route path="/admin-dashboard/data/:app/:model/:pk" element={guard(<AdminDataForm />)} />
    <Route path="*" element={<Navigate to="/admin-dashboard" replace />} />
  </>
)

// Company ERP (npm run dev -> 5173): registered companies and their Main / Sub companies
const erpRoutes = (
  <>
    <Route path="/login" element={<Login />} />
    <Route path="/change-password" element={<ChangePassword />} />
    <Route path="/admin-console" element={<ToAdminPortal />} />
    <Route path="/admin-dashboard/*" element={<ToAdminPortal />} />
    <Route path="/" element={guard(<Dashboard />)} />
    <Route path="/companies" element={guard(<Companies />)} />
    <Route path="/branches" element={guard(<Branches />)} />
    <Route path="/products" element={guard(<Products />)} />
    <Route path="/masters" element={guard(<Masters />)} />
    <Route path="/stock" element={guard(<Stock />)} />
    <Route path="/customers" element={guard(<Customers />)} />
    <Route path="/suppliers" element={guard(<Suppliers />)} />
    <Route path="/purchases" element={guard(<Purchases />)} />
    <Route path="/sales" element={guard(<Sales />)} />
    <Route path="/sales/invoices/:id/print" element={guard(<InvoicePrint />, true)} />
    <Route path="/payments" element={guard(<Payments />)} />
    <Route path="/reports" element={guard(<Reports />)} />
  </>
)

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>{IS_ADMIN_APP ? adminRoutes : erpRoutes}</Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
