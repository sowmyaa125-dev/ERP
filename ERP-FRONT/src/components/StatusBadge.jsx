import { statusClass, statusLabel } from '../utils/format'

export default function StatusBadge({ status }) {
  return <span className={`badge ${statusClass(status)}`}>{statusLabel(status)}</span>
}
