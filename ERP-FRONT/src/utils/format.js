const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

export const num = (value) => Number.parseFloat(value || 0) || 0
export const money = (value) => inr.format(num(value))
export const qty = (value) => plain.format(num(value))
export const shortDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN') : '')
export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

export const firstOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
}

// Flatten DRF error payloads ({field: [msg]}, {items: [{rate: [msg]}]}, "msg", [msg]) into one line.
export function errorMessage(err, fallback = 'Something went wrong.') {
  const data = err?.response?.data
  if (!data) return fallback
  const flatten = (value, key) => {
    if (value == null) return []
    if (typeof value === 'string') return [key && key !== 'non_field_errors' && key !== 'detail' ? `${key}: ${value}` : value]
    if (Array.isArray(value)) return value.flatMap((v) => flatten(v, key))
    return Object.entries(value).flatMap(([k, v]) => flatten(v, k))
  }
  return flatten(data).join(' ') || fallback
}

const STATUS_STYLES = {
  DRAFT: 'bg-secondary',
  SENT: 'bg-info text-dark',
  APPROVED: 'bg-primary',
  CONFIRMED: 'bg-primary',
  ACCEPTED: 'bg-primary',
  PARTIALLY_RECEIVED: 'bg-warning text-dark',
  PARTIALLY_INVOICED: 'bg-warning text-dark',
  PARTIALLY_PAID: 'bg-warning text-dark',
  RECEIVED: 'bg-success',
  INVOICED: 'bg-success',
  CONVERTED: 'bg-success',
  PAID: 'bg-success',
  ACTIVE: 'bg-success',
  UNPAID: 'bg-danger',
  REJECTED: 'bg-dark',
  CANCELLED: 'bg-dark',
}

export const statusClass = (status) => STATUS_STYLES[status] || 'bg-secondary'
export const statusLabel = (status) => (status || '').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

// rows: array of objects; columns: [{ key, label }]
export function downloadCsv(filename, rows, columns) {
  const escape = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const lines = [
    columns.map((c) => escape(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => escape(typeof c.key === 'function' ? c.key(r) : r[c.key])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
