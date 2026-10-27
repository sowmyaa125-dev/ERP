import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SITE_URLS } from '../appMode'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { getDashboardReport } from '../api/reports'
import StatusBadge from '../components/StatusBadge'
import { money, num, qty, shortDate } from '../utils/format'

// Validated categorical pair (light surface): sales = green, purchases = blue.
const SALES_COLOR = '#16a34a'
const PURCHASES_COLOR = '#2563eb'

// ₹ axis ticks in Indian short form: 1.2K, 3.4L, 1.1Cr.
const compactInr = (v) => {
  const n = Math.abs(v)
  if (n >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`
  return `₹${v}`
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.is_super_admin) return
    getDashboardReport()
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load dashboard.'))
  }, [user])

  if (user?.is_super_admin) {
    window.location.replace(`${SITE_URLS.admin}/admin-dashboard`)
    return null
  }

  const loading = !data && !error
  const trend = (data?.trend || []).map((t) => ({ ...t, sales: num(t.sales), purchases: num(t.purchases) }))
  const hasTrend = trend.some((t) => t.sales || t.purchases)

  return (
    <div className="container mt-4">
      <h2 className="mb-1">Dashboard</h2>
      <p className="text-muted mb-4">
        {user?.company_name ? `${user.company_name} · ` : ''}Welcome back, {user?.email}
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="stat-card bg-indigo">
            <div className="stat-icon">📈</div>
            <div className="stat-label">Sales this month</div>
            <div className="stat-value stat-value-money">{loading ? '…' : money(data?.sales_this_month)}</div>
            {data && <div className="stat-sub">{data.invoices_this_month} invoices · purchases {money(data.purchases_this_month)}</div>}
          </div>
        </div>
        <div className="col-md-3">
          <Link to="/payments" className="text-decoration-none">
            <div className="stat-card bg-teal">
              <div className="stat-icon">💰</div>
              <div className="stat-label">To receive</div>
              <div className="stat-value stat-value-money">{loading ? '…' : money(data?.receivables)}</div>
              <div className="stat-sub">Outstanding from customers</div>
            </div>
          </Link>
        </div>
        <div className="col-md-3">
          <Link to="/payments" className="text-decoration-none">
            <div className="stat-card bg-orange">
              <div className="stat-icon">💸</div>
              <div className="stat-label">To pay</div>
              <div className="stat-value stat-value-money">{loading ? '…' : money(data?.payables)}</div>
              <div className="stat-sub">Outstanding to suppliers</div>
            </div>
          </Link>
        </div>
        <div className="col-md-3">
          <Link to="/reports" className="text-decoration-none">
            <div className="stat-card bg-pink">
              <div className="stat-icon">📦</div>
              <div className="stat-label">Stock value</div>
              <div className="stat-value stat-value-money">{loading ? '…' : money(data?.stock_value)}</div>
              <div className="stat-sub">{data ? `${data.low_stock_count} products below minimum` : ''}</div>
            </div>
          </Link>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-8">
          <div className="chart-card h-100">
            <h5>Sales vs purchases · last 6 months</h5>
            {loading ? (
              <p className="text-muted">Loading chart...</p>
            ) : !hasTrend ? (
              <p className="text-muted">No invoices or bills yet. They will show here once you start billing.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend} barGap={2} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="#eef0ee" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compactInr} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v, name) => [money(v), name]} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sales" name="Sales" fill={SALES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="purchases" name="Purchases" fill={PURCHASES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="col-lg-4">
          <div className="chart-card h-100">
            <h5>Top products · last 6 months</h5>
            {data?.top_products?.length ? (
              <table className="table table-sm mb-0">
                <thead><tr><th>Product</th><th className="text-end">Qty</th><th className="text-end">Sales</th></tr></thead>
                <tbody>
                  {data.top_products.map((p) => (
                    <tr key={p.name}><td>{p.name}</td><td className="text-end">{qty(p.quantity)}</td><td className="text-end">{money(p.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-muted">{loading ? 'Loading...' : 'No sales yet.'}</p>}
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-7">
          <div className="chart-card h-100">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Recent invoices</h5>
              <Link to="/sales" className="small">View all</Link>
            </div>
            {data?.recent_invoices?.length ? (
              <table className="table table-sm mb-0">
                <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th className="text-end">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {data.recent_invoices.map((i) => (
                    <tr key={i.id}><td>{i.number}</td><td>{shortDate(i.date)}</td><td>{i.customer_name}</td>
                      <td className="text-end">{money(i.grand_total)}</td><td><StatusBadge status={i.status} /></td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-muted">{loading ? 'Loading...' : 'No invoices yet.'}</p>}
          </div>
        </div>
        <div className="col-lg-5">
          <div className="chart-card h-100">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">⚠ Low stock</h5>
              <Link to="/reports" className="small">Reorder list</Link>
            </div>
            {data?.low_stock?.length ? (
              <table className="table table-sm mb-0">
                <thead><tr><th>Product</th><th className="text-end">On hand</th><th className="text-end">Minimum</th></tr></thead>
                <tbody>
                  {data.low_stock.map((p) => (
                    <tr key={p.product_id}><td>{p.product_name}</td><td className="text-end text-danger fw-semibold">{qty(p.on_hand)} {p.unit}</td>
                      <td className="text-end">{qty(p.minimum_quantity)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-muted">{loading ? 'Loading...' : 'All products are above their minimum level.'}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
