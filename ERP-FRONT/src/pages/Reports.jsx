import { useEffect, useState } from 'react'
import useMasterData from '../hooks/useMasterData'
import StatusBadge from '../components/StatusBadge'
import { getGstReport, getPurchaseReport, getSalesReport, getStockReport } from '../api/reports'
import { downloadCsv, errorMessage, firstOfMonth, money, num, qty, shortDate, today } from '../utils/format'

const TABS = [
  { key: 'sales', label: 'Sales Register' },
  { key: 'purchases', label: 'Purchase Register' },
  { key: 'gst', label: 'GST Summary' },
  { key: 'stock', label: 'Stock Valuation' },
]

const LOADERS = { sales: getSalesReport, purchases: getPurchaseReport, gst: getGstReport, stock: getStockReport }

export default function Reports() {
  const master = useMasterData()
  const [tab, setTab] = useState('sales')
  const [filters, setFilters] = useState({ company: '', date_from: firstOfMonth(), date_to: today(), warehouse: '' })
  const [report, setReport] = useState(null) // { tab, data } — tagged so a tab never renders another tab's payload
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([k, v]) => v && (tab === 'stock' ? ['company', 'warehouse'].includes(k) : k !== 'warehouse')),
    )
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    let stale = false
    LOADERS[tab](params)
      .then((res) => { if (!stale) { setReport({ tab, data: res.data }); setError('') } })
      .catch((err) => { if (!stale) setError(errorMessage(err, 'Failed to load report.')) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [tab, filters])

  const setFilter = (name, value) => setFilters((f) => ({ ...f, [name]: value, ...(name === 'company' ? { warehouse: '' } : {}) }))
  const data = report?.tab === tab ? report.data : null
  const period = `${filters.date_from || 'start'}_to_${filters.date_to || 'today'}`

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 no-print">
        <h2 className="mb-0">Reports</h2>
        <button className="btn btn-outline-secondary" onClick={() => window.print()}>Print</button>
      </div>

      <ul className="nav nav-tabs mb-3 no-print">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          </li>
        ))}
      </ul>

      <div className="row g-2 mb-3 no-print">
        <div className="col-md-3">
          <select className="form-select" value={filters.company} onChange={(e) => setFilter('company', e.target.value)}>
            <option value="">All companies</option>
            {master.companies.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
          </select>
        </div>
        {tab === 'stock' ? (
          <div className="col-md-3">
            <select className="form-select" value={filters.warehouse} onChange={(e) => setFilter('warehouse', e.target.value)}>
              <option value="">All warehouses</option>
              {master.warehouses.filter((w) => !filters.company || String(w.company) === filters.company)
                .map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div className="col-md-2"><input type="date" className="form-control" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} title="From" /></div>
            <div className="col-md-2"><input type="date" className="form-control" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} title="To" /></div>
          </>
        )}
      </div>

      <h5 className="print-only">{TABS.find((t) => t.key === tab).label} · {tab === 'stock' ? `as of ${shortDate(today())}` : `${shortDate(filters.date_from)} – ${shortDate(filters.date_to)}`}</h5>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <p>Loading...</p>}

      {data && tab === 'sales' && <RegisterReport data={data} partyLabel="Customer" filename={`sales-register_${period}.csv`} />}
      {data && tab === 'purchases' && <RegisterReport data={data} partyLabel="Supplier" filename={`purchase-register_${period}.csv`} showSupplierInvoice />}
      {data && tab === 'gst' && <GstReport data={data} period={period} />}
      {data && tab === 'stock' && <StockReport data={data} />}
    </div>
  )
}

function CsvButton({ onClick }) {
  return <button className="btn btn-sm btn-outline-secondary no-print" onClick={onClick}>Export CSV</button>
}

function RegisterReport({ data, partyLabel, filename, showSupplierInvoice }) {
  const { rows, totals } = data
  const columns = [
    { key: 'number', label: 'Number' },
    ...(showSupplierInvoice ? [{ key: 'supplier_invoice_number', label: 'Supplier Invoice' }] : []),
    { key: 'date', label: 'Date' }, { key: 'party_name', label: partyLabel }, { key: 'party_gst_number', label: 'GSTIN' },
    { key: 'taxable_amount', label: 'Taxable' }, { key: 'cgst_amount', label: 'CGST' }, { key: 'sgst_amount', label: 'SGST' },
    { key: 'igst_amount', label: 'IGST' }, { key: 'grand_total', label: 'Total' }, { key: 'balance_due', label: 'Balance' },
    { key: 'status', label: 'Status' },
  ]
  return (
    <>
      <div className="row g-3 mb-3">
        <Kpi label="Documents" value={totals.count} />
        <Kpi label="Taxable value" value={money(totals.taxable_amount)} />
        <Kpi label="GST" value={money(num(totals.cgst_amount) + num(totals.sgst_amount) + num(totals.igst_amount))} />
        <Kpi label="Total (incl. GST)" value={money(totals.grand_total)} />
      </div>
      <div className="d-flex justify-content-end mb-2"><CsvButton onClick={() => downloadCsv(filename, rows, columns)} /></div>
      <div className="table-responsive">
        <table className="table table-sm table-striped">
          <thead>
            <tr>
              <th>Number</th>{showSupplierInvoice && <th>Supp. inv.</th>}<th>Date</th><th>{partyLabel}</th><th>GSTIN</th>
              <th className="text-end">Taxable</th><th className="text-end">CGST</th><th className="text-end">SGST</th>
              <th className="text-end">IGST</th><th className="text-end">Total</th><th className="text-end">Balance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.number}</td>{showSupplierInvoice && <td>{r.supplier_invoice_number}</td>}<td>{shortDate(r.date)}</td>
                <td>{r.party_name}</td><td>{r.party_gst_number}</td>
                <td className="text-end">{money(r.taxable_amount)}</td><td className="text-end">{money(r.cgst_amount)}</td>
                <td className="text-end">{money(r.sgst_amount)}</td><td className="text-end">{money(r.igst_amount)}</td>
                <td className="text-end">{money(r.grand_total)}</td><td className="text-end">{money(r.balance_due)}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="12" className="text-center text-muted">No documents in this period.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="fw-bold">
                <td colSpan={showSupplierInvoice ? 5 : 4}>Total</td>
                <td className="text-end">{money(totals.taxable_amount)}</td><td className="text-end">{money(totals.cgst_amount)}</td>
                <td className="text-end">{money(totals.sgst_amount)}</td><td className="text-end">{money(totals.igst_amount)}</td>
                <td className="text-end">{money(totals.grand_total)}</td><td className="text-end">{money(totals.balance_due)}</td><td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {data.by_product && data.by_product.length > 0 && (
        <>
          <h6 className="mt-4">Sales by product</h6>
          <table className="table table-sm table-striped">
            <thead><tr><th>Product</th><th>Code</th><th className="text-end">Quantity</th><th className="text-end">Taxable</th><th className="text-end">Total</th></tr></thead>
            <tbody>
              {data.by_product.map((p) => (
                <tr key={p.product_id}><td>{p.name}</td><td>{p.code}</td><td className="text-end">{qty(p.quantity)}</td>
                  <td className="text-end">{money(p.taxable_amount)}</td><td className="text-end">{money(p.total_amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

function TaxTable({ title, rows, total }) {
  return (
    <div className="col-lg-6">
      <h6>{title}</h6>
      <table className="table table-sm table-striped">
        <thead><tr><th>GST rate</th><th className="text-end">Taxable</th><th className="text-end">CGST</th><th className="text-end">SGST</th><th className="text-end">IGST</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.gst_percent}><td>{qty(r.gst_percent)}%</td><td className="text-end">{money(r.taxable_amount)}</td>
              <td className="text-end">{money(r.cgst_amount)}</td><td className="text-end">{money(r.sgst_amount)}</td><td className="text-end">{money(r.igst_amount)}</td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="5" className="text-center text-muted">None</td></tr>}
        </tbody>
        <tfoot>
          <tr className="fw-bold"><td>Total</td><td className="text-end">{money(total.taxable_amount)}</td>
            <td className="text-end">{money(total.cgst_amount)}</td><td className="text-end">{money(total.sgst_amount)}</td><td className="text-end">{money(total.igst_amount)}</td></tr>
        </tfoot>
      </table>
    </div>
  )
}

function GstReport({ data, period }) {
  const net = data.net_payable
  const exportHsn = () => downloadCsv(`hsn-summary_${period}.csv`, data.hsn_summary, [
    { key: 'hsn_code', label: 'HSN' }, { key: 'gst_percent', label: 'GST %' }, { key: 'quantity', label: 'Quantity' },
    { key: 'taxable_amount', label: 'Taxable' }, { key: 'cgst_amount', label: 'CGST' }, { key: 'sgst_amount', label: 'SGST' },
    { key: 'igst_amount', label: 'IGST' },
  ])
  return (
    <>
      <div className="row g-3 mb-3">
        <Kpi label="Output tax (sales)" value={money(data.outward_total.total_tax)} />
        <Kpi label="Input tax credit (purchases)" value={money(data.inward_total.total_tax)} />
        <Kpi label={num(net.total_tax) >= 0 ? 'Net GST payable' : 'Excess credit carried forward'} value={money(Math.abs(num(net.total_tax)))} strong />
        <Kpi label="Net split" value={`C ${money(net.cgst_amount)} · S ${money(net.sgst_amount)} · I ${money(net.igst_amount)}`} small />
      </div>
      <div className="row g-3">
        <TaxTable title="Outward supplies (sales)" rows={data.outward} total={data.outward_total} />
        <TaxTable title="Inward supplies (purchases)" rows={data.inward} total={data.inward_total} />
      </div>
      <div className="d-flex justify-content-between align-items-center mt-3 mb-2">
        <h6 className="mb-0">HSN summary of sales</h6>
        <CsvButton onClick={exportHsn} />
      </div>
      <table className="table table-sm table-striped">
        <thead><tr><th>HSN</th><th>GST %</th><th className="text-end">Quantity</th><th className="text-end">Taxable</th><th className="text-end">CGST</th><th className="text-end">SGST</th><th className="text-end">IGST</th></tr></thead>
        <tbody>
          {data.hsn_summary.map((h, i) => (
            <tr key={i}><td>{h.hsn_code || <span className="text-muted">missing</span>}</td><td>{qty(h.gst_percent)}%</td>
              <td className="text-end">{qty(h.quantity)}</td><td className="text-end">{money(h.taxable_amount)}</td>
              <td className="text-end">{money(h.cgst_amount)}</td><td className="text-end">{money(h.sgst_amount)}</td><td className="text-end">{money(h.igst_amount)}</td></tr>
          ))}
          {data.hsn_summary.length === 0 && <tr><td colSpan="7" className="text-center text-muted">No sales in this period.</td></tr>}
        </tbody>
      </table>
      <p className="text-muted small">
        Figures are from invoices and bills entered here and are meant to help prepare GSTR-1 / GSTR-3B; check them against your returns before filing.
      </p>
    </>
  )
}

function StockReport({ data }) {
  const exportRows = () => downloadCsv(`stock-valuation_${today()}.csv`, data.rows, [
    { key: 'product_code', label: 'Code' }, { key: 'product_name', label: 'Product' }, { key: 'warehouse_name', label: 'Warehouse' },
    { key: 'quantity', label: 'Quantity' }, { key: 'unit', label: 'Unit' }, { key: 'rate', label: 'Rate' }, { key: 'value', label: 'Value' },
  ])
  return (
    <>
      <div className="row g-3 mb-3">
        <Kpi label="Stock value (at purchase price)" value={money(data.total_value)} strong />
        <Kpi label="Product / warehouse lines" value={data.rows.length} />
        <Kpi label="Below minimum level" value={data.low_stock.length} />
      </div>

      {data.low_stock.length > 0 && (
        <div className="card card-body mb-3 border-warning">
          <h6 className="text-warning-emphasis">Reorder list</h6>
          <table className="table table-sm mb-0">
            <thead><tr><th>Product</th><th className="text-end">On hand</th><th className="text-end">Minimum</th><th className="text-end">Suggested order</th></tr></thead>
            <tbody>
              {data.low_stock.map((p) => (
                <tr key={p.product_id}><td>{p.product_name} <span className="text-muted">({p.product_code})</span></td>
                  <td className="text-end">{qty(p.on_hand)} {p.unit}</td><td className="text-end">{qty(p.minimum_quantity)}</td>
                  <td className="text-end fw-semibold">{qty(p.reorder_quantity)} {p.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="d-flex justify-content-end mb-2"><CsvButton onClick={exportRows} /></div>
      <table className="table table-sm table-striped">
        <thead><tr><th>Code</th><th>Product</th><th>Warehouse</th><th className="text-end">Quantity</th><th className="text-end">Rate</th><th className="text-end">Value</th></tr></thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={`${r.product_id}-${r.warehouse_id}`}>
              <td>{r.product_code}</td><td>{r.product_name}</td><td>{r.warehouse_name}</td>
              <td className={`text-end ${num(r.quantity) < 0 ? 'text-danger' : ''}`}>{qty(r.quantity)} {r.unit}</td>
              <td className="text-end">{money(r.rate)}</td><td className="text-end">{money(r.value)}</td>
            </tr>
          ))}
          {data.rows.length === 0 && <tr><td colSpan="6" className="text-center text-muted">No stock recorded.</td></tr>}
        </tbody>
        {data.rows.length > 0 && (
          <tfoot><tr className="fw-bold"><td colSpan="5">Total</td><td className="text-end">{money(data.total_value)}</td></tr></tfoot>
        )}
      </table>
    </>
  )
}

function Kpi({ label, value, strong, small }) {
  return (
    <div className="col-md-3">
      <div className="card card-body py-3 h-100">
        <div className="form-label mb-1">{label}</div>
        <div className={small ? 'small fw-semibold' : `fs-5 ${strong ? 'fw-bold text-success' : 'fw-semibold'}`}>{value}</div>
      </div>
    </div>
  )
}
