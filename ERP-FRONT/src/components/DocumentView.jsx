import Modal from './Modal'
import StatusBadge from './StatusBadge'
import { TotalsBox } from './LineItemsEditor'
import { money, qty, shortDate } from '../utils/format'

/**
 * Read-only view of a saved GST document.
 * details: [{ label, value }] shown in the header grid.
 * extraColumns: [{ label, render(line) }] appended to the lines table (e.g. received qty).
 * actions: buttons rendered in the footer.
 */
export default function DocumentView({ doc, title, partyName, details = [], extraColumns = [], actions, onClose }) {
  return (
    <Modal title={title || doc.number} size="xl" onClose={onClose} footer={actions}>
      <div className="row g-3 mb-3 doc-details">
        <div className="col-md-3"><div className="form-label">Number</div><div className="fw-semibold">{doc.number}</div></div>
        <div className="col-md-3"><div className="form-label">Date</div><div>{shortDate(doc.date)}</div></div>
        <div className="col-md-3"><div className="form-label">Party</div><div>{partyName}</div></div>
        <div className="col-md-3"><div className="form-label">Status</div><StatusBadge status={doc.status} /></div>
        {details.filter((d) => d.value).map((d) => (
          <div className="col-md-3" key={d.label}><div className="form-label">{d.label}</div><div>{d.value}</div></div>
        ))}
      </div>

      <div className="table-responsive">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>#</th><th>Product</th><th>HSN</th><th className="text-end">Qty</th>
              {extraColumns.map((c) => <th key={c.label} className="text-end">{c.label}</th>)}
              <th className="text-end">Rate</th><th className="text-end">Disc %</th><th className="text-end">GST %</th>
              <th className="text-end">Taxable</th><th className="text-end">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((l, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>{l.product_name}{l.description ? <div className="small text-muted">{l.description}</div> : null}</td>
                <td>{l.hsn_code}</td>
                <td className="text-end">{qty(l.quantity)} {l.unit_name || ''}</td>
                {extraColumns.map((c) => <td key={c.label} className="text-end">{c.render(l)}</td>)}
                <td className="text-end">{money(l.rate)}</td>
                <td className="text-end">{qty(l.discount_percent)}</td>
                <td className="text-end">{qty(l.gst_percent)}</td>
                <td className="text-end">{money(l.taxable_amount)}</td>
                <td className="text-end">{money(l.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between flex-wrap gap-3">
        <div className="text-muted small" style={{ maxWidth: 420 }}>{doc.notes}</div>
        <TotalsBox
          taxable={doc.taxable_amount} cgst={doc.cgst_amount} sgst={doc.sgst_amount} igst={doc.igst_amount}
          roundOff={doc.round_off} grand={doc.grand_total} interState={doc.is_inter_state}
        />
      </div>
    </Modal>
  )
}
