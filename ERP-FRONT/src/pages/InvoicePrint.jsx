import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getAllStates } from 'india-state-district'
import { getInvoicePrintData } from '../api/sales'
import { errorMessage, money, num, qty, shortDate } from '../utils/format'

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowThousand(n) {
  const h = Math.floor(n / 100)
  const r = n % 100
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`
  return [h ? `${ONES[h]} Hundred` : '', rest].filter(Boolean).join(' ')
}

// Indian numbering: crore, lakh, thousand.
function indianWords(n) {
  const parts = []
  if (n >= 10000000) {
    parts.push(`${indianWords(Math.floor(n / 10000000))} Crore`)
    n %= 10000000
  }
  if (n >= 100000) {
    parts.push(`${belowThousand(Math.floor(n / 100000))} Lakh`)
    n %= 100000
  }
  if (n >= 1000) {
    parts.push(`${belowThousand(Math.floor(n / 1000))} Thousand`)
    n %= 1000
  }
  if (n) parts.push(belowThousand(n))
  return parts.join(' ')
}

const rupeesInWords = (amount) => `Rupees ${indianWords(Math.round(num(amount))) || 'Zero'} Only`

const stateName = (code) => getAllStates().find((s) => s.code === code)?.name || code || ''

function Party({ title, p }) {
  return (
    <div>
      <div className="print-label">{title}</div>
      <div className="fw-bold">{p.name}</div>
      {p.address && <div>{p.address}</div>}
      <div>{[p.district, stateName(p.state), p.pin_code].filter(Boolean).join(', ')}</div>
      {p.phone && <div>Phone: {p.phone}</div>}
      {p.email && <div>{p.email}</div>}
      <div><strong>GSTIN:</strong> {p.gst_number || 'Unregistered'}</div>
    </div>
  )
}

export default function InvoicePrint() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getInvoicePrintData(id)
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err, 'Failed to load invoice.')))
  }, [id])

  if (error) return <div className="container mt-4 alert alert-danger">{error}</div>
  if (!data) return <div className="container mt-4">Loading...</div>

  const { invoice: inv, seller, buyer } = data
  const inter = inv.is_inter_state

  // Tax summary by rate.
  const byRate = {}
  for (const l of inv.items) {
    const r = (byRate[l.gst_percent] ||= { rate: l.gst_percent, taxable: 0, cgst: 0, sgst: 0, igst: 0 })
    r.taxable += num(l.taxable_amount)
    r.cgst += num(l.cgst_amount)
    r.sgst += num(l.sgst_amount)
    r.igst += num(l.igst_amount)
  }

  return (
    <div className="invoice-print">
      <div className="d-flex justify-content-end gap-2 mb-3 no-print">
        <button className="btn btn-outline-secondary" onClick={() => window.close()}>Close</button>
        <button className="btn btn-success" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <div className="invoice-sheet">
        {inv.status === 'CANCELLED' && <div className="invoice-cancelled">CANCELLED</div>}
        <div className="d-flex justify-content-between align-items-start border-bottom pb-2 mb-3">
          <div>
            <h3 className="mb-0">{seller.name}</h3>
            <div className="small">{[seller.address, seller.district, stateName(seller.state), seller.pin_code].filter(Boolean).join(', ')}</div>
            <div className="small"><strong>GSTIN:</strong> {seller.gst_number || '—'}{seller.phone ? ` · Phone: ${seller.phone}` : ''}</div>
          </div>
          <div className="text-end">
            <h4 className="mb-1">TAX INVOICE</h4>
            <div className="small">Original for Recipient</div>
          </div>
        </div>

        <div className="row mb-3 small">
          <div className="col-6"><Party title="Bill to" p={buyer} /></div>
          <div className="col-6">
            <table className="table table-sm table-borderless mb-0">
              <tbody>
                <tr><th>Invoice no.</th><td>{inv.number}</td></tr>
                <tr><th>Invoice date</th><td>{shortDate(inv.date)}</td></tr>
                {inv.due_date && <tr><th>Due date</th><td>{shortDate(inv.due_date)}</td></tr>}
                {inv.sales_order_number && <tr><th>Order ref.</th><td>{inv.sales_order_number}</td></tr>}
                <tr><th>Place of supply</th><td>{stateName(inv.place_of_supply) || '—'}</td></tr>
                <tr><th>Supply type</th><td>{inter ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <table className="table table-sm table-bordered small invoice-lines">
          <thead>
            <tr>
              <th>#</th><th>Item</th><th>HSN/SAC</th><th className="text-end">Qty</th><th className="text-end">Rate</th>
              <th className="text-end">Disc %</th><th className="text-end">Taxable</th><th className="text-end">GST %</th>
              {inter ? <th className="text-end">IGST</th> : <><th className="text-end">CGST</th><th className="text-end">SGST</th></>}
              <th className="text-end">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.product_name}{l.description ? <div className="text-muted">{l.description}</div> : null}</td>
                <td>{l.hsn_code}</td>
                <td className="text-end">{qty(l.quantity)} {l.unit_name || ''}</td>
                <td className="text-end">{money(l.rate)}</td>
                <td className="text-end">{num(l.discount_percent) ? qty(l.discount_percent) : ''}</td>
                <td className="text-end">{money(l.taxable_amount)}</td>
                <td className="text-end">{qty(l.gst_percent)}</td>
                {inter ? <td className="text-end">{money(l.igst_amount)}</td> : (
                  <><td className="text-end">{money(l.cgst_amount)}</td><td className="text-end">{money(l.sgst_amount)}</td></>
                )}
                <td className="text-end">{money(l.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row small">
          <div className="col-7">
            <table className="table table-sm table-bordered">
              <thead>
                <tr><th>GST %</th><th className="text-end">Taxable</th>
                  {inter ? <th className="text-end">IGST</th> : <><th className="text-end">CGST</th><th className="text-end">SGST</th></>}
                </tr>
              </thead>
              <tbody>
                {Object.values(byRate).map((r) => (
                  <tr key={r.rate}>
                    <td>{qty(r.rate)}%</td><td className="text-end">{money(r.taxable)}</td>
                    {inter ? <td className="text-end">{money(r.igst)}</td> : <><td className="text-end">{money(r.cgst)}</td><td className="text-end">{money(r.sgst)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
            <div><strong>Amount in words:</strong> {rupeesInWords(inv.grand_total)}</div>
            {inv.notes && <div className="mt-2"><strong>Notes:</strong> {inv.notes}</div>}
          </div>
          <div className="col-5">
            <table className="table table-sm mb-0">
              <tbody>
                <tr><td>Taxable value</td><td className="text-end">{money(inv.taxable_amount)}</td></tr>
                {inter ? <tr><td>IGST</td><td className="text-end">{money(inv.igst_amount)}</td></tr> : (
                  <>
                    <tr><td>CGST</td><td className="text-end">{money(inv.cgst_amount)}</td></tr>
                    <tr><td>SGST</td><td className="text-end">{money(inv.sgst_amount)}</td></tr>
                  </>
                )}
                {num(inv.round_off) !== 0 && <tr><td>Round off</td><td className="text-end">{money(inv.round_off)}</td></tr>}
                <tr className="fw-bold fs-6"><td>Total</td><td className="text-end">{money(inv.grand_total)}</td></tr>
                {num(inv.amount_paid) > 0 && (
                  <>
                    <tr><td>Received</td><td className="text-end">{money(inv.amount_paid)}</td></tr>
                    <tr className="fw-bold"><td>Balance due</td><td className="text-end">{money(inv.balance_due)}</td></tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="d-flex justify-content-between align-items-end mt-5 small">
          <div className="text-muted">This is a computer-generated invoice.</div>
          <div className="text-center">
            <div style={{ height: 48 }}></div>
            <div className="border-top pt-1">For {seller.name}<br />Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  )
}
