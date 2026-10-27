import { money, num } from '../utils/format'

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

let keySeq = 0
export const blankLine = () => ({
  key: `l${++keySeq}`, product: '', description: '', quantity: '', rate: '', discount_percent: 0, gst_percent: 0,
})

// Same maths as the backend TaxLine.compute(), for a live preview.
export function computeLine(line, interState) {
  const taxable = round2(num(line.quantity) * num(line.rate) * (1 - num(line.discount_percent) / 100))
  const tax = round2((taxable * num(line.gst_percent)) / 100)
  const cgst = interState ? 0 : round2(tax / 2)
  return {
    taxable, cgst, sgst: interState ? 0 : round2(tax - cgst), igst: interState ? tax : 0, total: round2(taxable + tax),
  }
}

export function computeTotals(lines, interState) {
  const t = lines.reduce(
    (acc, l) => {
      const c = computeLine(l, interState)
      return { taxable: acc.taxable + c.taxable, cgst: acc.cgst + c.cgst, sgst: acc.sgst + c.sgst, igst: acc.igst + c.igst }
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0 },
  )
  const exact = round2(t.taxable + t.cgst + t.sgst + t.igst)
  const grand = Math.round(exact)
  return { ...t, roundOff: round2(grand - exact), grand }
}

// Default rate (ex-GST) and GST % for a product.
export function pricingFor(product, priceField, gstRateById) {
  const gst = gstRateById[product.gst_master] ?? 0
  let rate = num(product[priceField])
  if (product.tax_type === 'INCLUSIVE' && gst) rate = round2(rate / (1 + gst / 100))
  return { rate, gst_percent: gst }
}

// Turn a saved document line into an editable one (used for edit, convert, receive, invoice-from-order).
export const lineFromSaved = (l, overrides = {}) => ({
  key: `l${++keySeq}`,
  product: l.product, description: l.description || '', quantity: l.quantity, rate: l.rate,
  discount_percent: l.discount_percent, gst_percent: l.gst_percent, ...overrides,
})

export default function LineItemsEditor({ lines, onChange, products, priceField, gstRateById, unitById, interState }) {
  const update = (key, patch) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const remove = (key) => onChange(lines.filter((l) => l.key !== key))

  const pickProduct = (key, productId) => {
    const product = products.find((p) => String(p.id) === String(productId))
    update(key, product ? { product: product.id, ...pricingFor(product, priceField, gstRateById) } : { product: '' })
  }

  const totals = computeTotals(lines, interState)

  return (
    <div>
      <div className="table-responsive">
        <table className="table table-sm align-middle line-items" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Product</th>
              <th style={{ width: 150 }}>Qty</th>
              <th style={{ width: 130 }}>Rate (ex-GST)</th>
              <th style={{ width: 90 }}>Disc %</th>
              <th style={{ width: 90 }}>GST %</th>
              <th className="text-end" style={{ width: 120 }}>Taxable</th>
              <th className="text-end" style={{ width: 120 }}>Total</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const c = computeLine(l, interState)
              const product = products.find((p) => p.id === l.product)
              const unit = product?.unit ? unitById[product.unit]?.short_name : ''
              return (
                <tr key={l.key}>
                  <td>
                    <select
                      className="form-select form-select-sm" value={l.product} required
                      disabled={Boolean(l.order_item)}
                      onChange={(e) => pickProduct(l.key, e.target.value)}
                    >
                      <option value="">-- Select product --</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                    </select>
                    {l.max_quantity != null && (
                      <div className="form-text">Pending on order: {l.max_quantity}</div>
                    )}
                  </td>
                  <td>
                    <div className="input-group input-group-sm">
                      <input
                        type="number" step="0.01" min="0.01" className="form-control" required
                        max={l.max_quantity ?? undefined}
                        value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })}
                      />
                      {unit && <span className="input-group-text">{unit}</span>}
                    </div>
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" className="form-control form-control-sm" required
                      value={l.rate} onChange={(e) => update(l.key, { rate: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" max="100" className="form-control form-control-sm"
                      value={l.discount_percent} onChange={(e) => update(l.key, { discount_percent: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" className="form-control form-control-sm"
                      value={l.gst_percent} onChange={(e) => update(l.key, { gst_percent: e.target.value })} />
                  </td>
                  <td className="text-end">{money(c.taxable)}</td>
                  <td className="text-end fw-semibold">{money(c.total)}</td>
                  <td>
                    <button type="button" className="btn btn-sm btn-outline-danger px-2" title="Remove line"
                      onClick={() => remove(l.key)} disabled={lines.length === 1}>×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onChange([...lines, blankLine()])}>
          + Add line
        </button>
        <TotalsBox
          taxable={totals.taxable} cgst={totals.cgst} sgst={totals.sgst} igst={totals.igst}
          roundOff={totals.roundOff} grand={totals.grand} interState={interState}
        />
      </div>
    </div>
  )
}

export function TotalsBox({ taxable, cgst, sgst, igst, roundOff, grand, interState }) {
  return (
    <table className="table table-sm totals-box mb-0">
      <tbody>
        <tr><td>Taxable value</td><td className="text-end">{money(taxable)}</td></tr>
        {interState ? (
          <tr><td>IGST</td><td className="text-end">{money(igst)}</td></tr>
        ) : (
          <>
            <tr><td>CGST</td><td className="text-end">{money(cgst)}</td></tr>
            <tr><td>SGST</td><td className="text-end">{money(sgst)}</td></tr>
          </>
        )}
        {num(roundOff) !== 0 && <tr><td>Round off</td><td className="text-end">{money(roundOff)}</td></tr>}
        <tr className="fw-bold"><td>Grand total</td><td className="text-end">{money(grand)}</td></tr>
      </tbody>
    </table>
  )
}
