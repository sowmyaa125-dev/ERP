import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/Modal'
import {
  changePassword, deleteObject, getAddForm, getChangeForm, getDeletePreview, getHistory, saveObject,
} from '../../api/adminData'
import { errorMessage } from '../../utils/format'
import { dataPath } from './AdminDataIndex'
import { AdminBreadcrumb, Cell, DeleteSummary } from './AdminDataList'

const isoLocal = (v) => (v ? String(v).slice(0, 16) : '') // "2026-10-06T10:30:00+05:30" -> "2026-10-06T10:30"
const FULL_WIDTH = new Set(['textarea', 'multiselect', 'password_hash', 'file'])

/**
 * Add / change form, built from the model's Django admin form but styled like the rest of the ERP.
 * Used as a page (routes) or, with `embedded={{ app, model, onClose, onSaved }}`, as the body of an "add" pop-up.
 */
export default function AdminDataForm({ embedded = null }) {
  const { user } = useAuth()
  const params = useParams()
  const app = embedded ? embedded.app : params.app
  const model = embedded ? embedded.model : params.model
  const pk = embedded ? 'add' : params.pk
  const isAdd = pk === 'add'
  const navigate = useNavigate()

  const [schema, setSchema] = useState(null)
  const [values, setValues] = useState({})
  const [files, setFiles] = useState({})
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState(null) // { kind: 'delete' | 'history' | 'password', data }
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!user?.is_super_admin) return
    const load = isAdd ? getAddForm(app, model) : getChangeForm(app, model, pk)
    load
      .then((res) => {
        setSchema(res.data)
        const initial = {}
        res.data.fieldsets.forEach((fs) => fs.fields.forEach((f) => {
          if (f.type !== 'readonly' && f.type !== 'password_hash' && f.type !== 'file') initial[f.name] = f.value ?? (f.type === 'multiselect' ? [] : '')
        }))
        setValues(initial)
        setFiles({})
        setErrors({})
        setLoadError('')
      })
      .catch((err) => setLoadError(errorMessage(err, 'Failed to load.')))
  }, [app, model, pk, isAdd, reloadKey, user])

  const editable = useMemo(() => schema && (isAdd ? schema.perms.add : schema.perms.change), [schema, isAdd])

  if (!user?.is_super_admin) return <Navigate to="/" replace />

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }))
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
  }

  const save = async (after) => {
    setMenuOpen(false)
    setSaving(true)
    setErrors({})
    setMessage('')
    try {
      const res = await saveObject(app, model, isAdd ? null : pk, values, files)
      const msg = res.data.detail
      if (embedded) {
        embedded.onSaved(msg)
        if (after === 'another') {
          setMessage(`${msg} You can add another below.`)
          setReloadKey((k) => k + 1)
        } else {
          embedded.onClose()
        }
        return
      }
      if (after === 'another') {
        setMessage(`${msg} You can add another below.`)
        if (isAdd) setReloadKey((k) => k + 1)
        else navigate(`${dataPath(app, model)}/add`)
      } else if (after === 'continue') {
        setMessage(msg)
        if (isAdd) navigate(dataPath(app, model, res.data.pk), { replace: true })
        else setReloadKey((k) => k + 1)
      } else {
        navigate(dataPath(app, model), { state: { message: msg } })
      }
    } catch (err) {
      const data = err.response?.data
      if (data?.errors) setErrors(data.errors)
      else setErrors({ non_field_errors: [errorMessage(err, 'Failed to save.')] })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  const openDelete = async () => {
    try {
      const res = await getDeletePreview(app, model, pk)
      setModal({ kind: 'delete', data: res.data })
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  const confirmDelete = async () => {
    try {
      const res = await deleteObject(app, model, pk)
      navigate(dataPath(app, model), { state: { message: res.data.detail } })
    } catch (err) {
      if (err.response?.data?.protected) setModal({ kind: 'delete', data: err.response.data })
      else alert(errorMessage(err))
    }
  }

  const openHistory = async () => {
    const res = await getHistory(app, model, pk)
    setModal({ kind: 'history', data: res.data })
  }

  if (loadError) return <div className="container mt-4"><div className="alert alert-danger">{loadError}</div></div>
  if (!schema) return <div className="container mt-4 text-muted">Loading…</div>

  const singular = schema.name_singular.toLowerCase()
  const title = isAdd ? `Add ${singular}` : schema.str
  const fieldErrorCount = Object.entries(errors).filter(([k, v]) => k !== 'non_field_errors' && v).length

  return (
    <div className={embedded ? 'adm-page adm-embedded' : 'container mt-4 adm-page'}>
      {!embedded && <AdminBreadcrumb items={[{ label: schema.name, to: dataPath(app, model) }, { label: isAdd ? `Add ${singular}` : schema.str }]} />}

      {!embedded && <div className="adm-page-header">
        <div className="adm-page-icon">{(schema.name_singular[0] || '?').toUpperCase()}</div>
        <div className="flex-grow-1">
          <h2 className="mb-0">{title}</h2>
          <p className="text-muted mb-0 small">
            {isAdd ? `Create a new ${singular}` : `${editable ? 'Edit' : 'View'} ${singular} details`}
          </p>
        </div>
        {!isAdd && (
          <div className="d-flex gap-2 flex-wrap">
            {schema.can_change_password && (
              <button className="btn btn-outline-secondary" onClick={() => setModal({ kind: 'password' })}>🔑 Change password</button>
            )}
            <button className="btn btn-outline-secondary" onClick={openHistory}>🕘 History</button>
          </div>
        )}
      </div>}

      {message && <div className="alert alert-success">{message}</div>}
      {errors.non_field_errors && <div className="alert alert-danger">{errors.non_field_errors.join(' ')}</div>}
      {fieldErrorCount > 0 && (
        <div className="alert alert-danger">Please fix the {fieldErrorCount === 1 ? 'highlighted field' : `${fieldErrorCount} highlighted fields`} below.</div>
      )}
      {!editable && (
        <div className="alert alert-secondary py-2 small">
          View only. This record is managed by the app&apos;s own screens so stock and balances stay correct.
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); save('list') }}>
        {schema.fieldsets.map((fs, i) => (
          <Section key={i} fieldset={fs} fallbackTitle={i === 0 ? `${schema.name_singular} details` : null}>
            <div className="row g-3">
              {fs.fields.map((f) => (
                <Field key={f.name} field={f}
                  compact={fs.fields.length <= 3 && fs.fields.some((x) => x.type === 'password' || x.type === 'password_hash')} value={values[f.name]} error={errors[f.name]}
                  onChange={(v) => set(f.name, v)}
                  onFile={(file) => setFiles((x) => ({ ...x, [f.name]: file }))}
                  onPasswordClick={() => setModal({ kind: 'password' })} canChangePassword={schema.can_change_password} />
              ))}
            </div>
          </Section>
        ))}

        {schema.inlines?.map((inline) => (
          <div className="card adm-section mb-3" key={inline.model}>
            <div className="adm-section-head">
              <h6 className="mb-0">{inline.title}</h6>
              <span className="adm-pill">{inline.rows.length}</span>
            </div>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead><tr>{inline.columns.map((c) => <th key={c.name}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {inline.rows.map((r) => (
                    <tr key={r.pk}>{r.values.map((v, j) => <td key={j}><Cell value={v} /></td>)}</tr>
                  ))}
                  {inline.rows.length === 0 && <tr><td colSpan={inline.columns.length} className="text-muted text-center py-3">No items</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <div className="adm-actionbar">
          <div>
            {!isAdd && schema.perms.delete && (
              <button type="button" className="btn btn-outline-danger" onClick={openDelete}>🗑 Delete</button>
            )}
          </div>
          <div className="d-flex gap-2 align-items-center">
            {embedded ? (
              <button type="button" className="btn btn-outline-secondary" onClick={embedded.onClose}>Cancel</button>
            ) : (
              <Link className="btn btn-outline-secondary" to={dataPath(app, model)}>{editable ? 'Cancel' : '← Back to list'}</Link>
            )}
            {editable && (
              <div className="btn-group position-relative">
                <button type="submit" className="btn btn-success px-4" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" className="btn btn-success dropdown-toggle dropdown-toggle-split" disabled={saving}
                  aria-label="More save options" onClick={() => setMenuOpen(!menuOpen)} />
                {menuOpen && (
                  <div className="adm-save-menu">
                    {!embedded && <button type="button" onClick={() => save('continue')}>Save and keep editing</button>}
                    {schema.perms.add && <button type="button" onClick={() => save('another')}>Save and add another</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </form>

      {modal?.kind === 'delete' && (
        <Modal title={`Delete ${singular}?`} onClose={() => setModal(null)}
          footer={(
            <>
              <button className="btn btn-outline-secondary" onClick={() => setModal(null)}>Cancel</button>
              {!modal.data.protected?.length && !modal.data.perms_needed?.length && (
                <button className="btn btn-danger" onClick={confirmDelete}>Yes, delete</button>
              )}
            </>
          )}>
          <DeleteSummary summary={modal.data} />
        </Modal>
      )}

      {modal?.kind === 'history' && (
        <Modal title="Change history" onClose={() => setModal(null)}>
          {modal.data.entries.length === 0 ? (
            <p className="text-muted mb-0">No changes have been recorded for this {singular} yet.</p>
          ) : (
            <ul className="adm-timeline">
              {modal.data.entries.map((e) => (
                <li key={e.id} className={`adm-timeline-${e.action.toLowerCase()}`}>
                  <div className="fw-semibold">{e.change_message || e.action}</div>
                  <div className="small text-muted">
                    {e.user} · {new Date(e.action_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {modal?.kind === 'password' && (
        <PasswordModal app={app} model={model} pk={pk} name={schema.str} onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setMessage(msg) }} />
      )}
    </div>
  )
}

function Section({ fieldset, fallbackTitle, children }) {
  const [open, setOpen] = useState(!fieldset.collapsed)
  const title = fieldset.title || fallbackTitle
  return (
    <div className="card adm-section mb-3">
      {title && (
        <div className="adm-section-head">
          <h6 className="mb-0">{title}</h6>
          {fieldset.collapsed && (
            <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button>
          )}
        </div>
      )}
      {open && (
        <div className="card-body">
          {fieldset.description && <p className="text-muted small">{fieldset.description}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

function Field({ field: f, compact, value, error, onChange, onFile, onPasswordClick, canChangePassword }) {
  const isRequired = f.required && f.type !== 'readonly'
  // Short password sections stack in one column; everything else uses two columns.
  const width = compact ? 'col-12 col-lg-8' : FULL_WIDTH.has(f.type) ? 'col-12' : 'col-md-6'

  if (f.type === 'checkbox') {
    return (
      <div className="col-md-6">
        <div className="adm-switch">
          <div className="form-check form-switch mb-0">
            <input id={`f-${f.name}`} type="checkbox" role="switch" className="form-check-input"
              checked={Boolean(value)} disabled={f.disabled} onChange={(e) => onChange(e.target.checked)} />
            <label htmlFor={`f-${f.name}`} className="form-check-label fw-semibold">{f.label}</label>
          </div>
          {f.help_text && <div className="small text-muted mt-1">{f.help_text}</div>}
          {error && <div className="text-danger small mt-1">{error.join(' ')}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className={width}>
      <label className="form-label" htmlFor={`f-${f.name}`}>
        {f.label}{isRequired && <span className="text-danger"> *</span>}
      </label>
      <FieldInput field={f} value={value} invalid={Boolean(error)} onChange={onChange} onFile={onFile}
        onPasswordClick={onPasswordClick} canChangePassword={canChangePassword} />
      {error && <div className="invalid-feedback d-block">{error.join(' ')}</div>}
      {f.help_text && f.type !== 'password_hash' && (
        // Django's select-box tip doesn't apply to the checkbox list used here.
        <div className="form-text">{f.help_text.replace(/\s*Hold down .*select more than one\.?/, '')}</div>
      )}
      {f.help_list?.length > 0 && (
        <ul className="adm-hints">{f.help_list.map((h) => <li key={h}>{h}</li>)}</ul>
      )}
    </div>
  )
}

function FieldInput({ field: f, value, invalid, onChange, onFile, onPasswordClick, canChangePassword }) {
  const cls = (base) => `${base}${invalid ? ' is-invalid' : ''}`
  const id = `f-${f.name}`
  switch (f.type) {
    case 'readonly':
      return <div className="adm-readonly"><Cell value={f} /></div>
    case 'password_hash':
      return (
        <div className="adm-readonly d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span className="text-muted small">Passwords are stored encrypted and can&apos;t be shown.</span>
          {canChangePassword && <button type="button" className="btn btn-sm btn-outline-primary" onClick={onPasswordClick}>Change password</button>}
        </div>
      )
    case 'nullboolean':
      return (
        <select id={id} className={cls('form-select')} value={value === true ? 'true' : value === false ? 'false' : ''} disabled={f.disabled}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}>
          <option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option>
        </select>
      )
    case 'select':
      return (
        <>
          <select id={id} className={cls('form-select')} value={value ?? ''} required={f.required} disabled={f.disabled} onChange={(e) => onChange(e.target.value)}>
            <option value="">-- Select --</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {f.options_truncated && <div className="form-text">Showing the first {f.options.length} options.</div>}
        </>
      )
    case 'multiselect':
      return <MultiSelect field={f} value={value || []} onChange={onChange} />
    case 'textarea':
      return <textarea id={id} className={cls('form-control')} rows="3" value={value ?? ''} required={f.required} disabled={f.disabled} onChange={(e) => onChange(e.target.value)} />
    case 'datetime':
      return <input id={id} type="datetime-local" className={cls('form-control')} value={isoLocal(value)} required={f.required} disabled={f.disabled} onChange={(e) => onChange(e.target.value)} />
    case 'file':
      return (
        <div className="adm-file">
          {f.value && (
            <div className="small mb-2 d-flex align-items-center gap-3 flex-wrap">
              <span>Current file: <a href={f.value} target="_blank" rel="noreferrer">{f.current_name}</a></span>
              {!f.required && (
                <label className="form-check mb-0">
                  <input type="checkbox" className="form-check-input" onChange={(e) => onChange(e.target.checked ? false : undefined)} />
                  <span className="form-check-label">Remove it</span>
                </label>
              )}
            </div>
          )}
          <input id={id} type="file" className={cls('form-control')} disabled={f.disabled} onChange={(e) => onFile(e.target.files[0] || null)} />
        </div>
      )
    default:
      return (
        <input id={id} type={f.type === 'number' ? 'number' : f.type} step={f.step} className={cls('form-control')} value={value ?? ''}
          required={f.required} disabled={f.disabled} maxLength={f.max_length}
          autoComplete={f.type === 'password' ? 'new-password' : undefined}
          onChange={(e) => onChange(e.target.value)} />
      )
  }
}

/** Searchable list of options with selected items shown as chips. */
function MultiSelect({ field, value, onChange }) {
  const [filter, setFilter] = useState('')
  const chosen = new Set(value.map(String))
  const q = filter.toLowerCase()
  const shown = field.options.filter((o) => !q || o.label.toLowerCase().includes(q))
  const selected = field.options.filter((o) => chosen.has(String(o.value)))
  const toggle = (v) => {
    const key = String(v)
    onChange(chosen.has(key) ? value.filter((x) => String(x) !== key) : [...value, v])
  }
  return (
    <div className="adm-multi">
      {selected.length > 0 && (
        <div className="adm-chips">
          {selected.slice(0, 12).map((o) => (
            <span key={o.value} className="adm-chip">
              {o.label}
              {!field.disabled && <button type="button" aria-label={`Remove ${o.label}`} onClick={() => toggle(o.value)}>×</button>}
            </span>
          ))}
          {selected.length > 12 && <span className="adm-chip">+{selected.length - 12} more</span>}
        </div>
      )}
      <div className="adm-multi-toolbar">
        <input className="form-control form-control-sm" placeholder="🔍 Search options…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="small text-muted text-nowrap">{chosen.size} selected</span>
        <button type="button" className="btn btn-sm btn-link text-nowrap" onClick={() => onChange(shown.map((o) => o.value))}>Select all</button>
        <button type="button" className="btn btn-sm btn-link text-nowrap" onClick={() => onChange([])}>Clear</button>
      </div>
      <div className="adm-multi-list">
        {shown.map((o) => (
          <label key={o.value} className={chosen.has(String(o.value)) ? 'is-selected' : ''}>
            <input type="checkbox" className="form-check-input me-2" checked={chosen.has(String(o.value))} disabled={field.disabled} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
        {shown.length === 0 && <span className="text-muted small">No options</span>}
      </div>
    </div>
  )
}

function PasswordModal({ app, model, pk, name, onClose, onDone }) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [errors, setErrors] = useState({})
  const submit = async (e) => {
    e.preventDefault()
    try {
      const res = await changePassword(app, model, pk, { password1: p1, password2: p2 })
      onDone(res.data.detail)
    } catch (err) {
      setErrors(err.response?.data?.errors || { non_field_errors: [errorMessage(err)] })
    }
  }
  const fieldErr = (k) => errors[k] && <div className="invalid-feedback d-block">{errors[k].join(' ')}</div>
  return (
    <Modal title={`Change password · ${name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {errors.non_field_errors && <div className="alert alert-danger">{errors.non_field_errors.join(' ')}</div>}
        <div className="mb-3">
          <label className="form-label">New password</label>
          <input type="password" className={`form-control${errors.password1 ? ' is-invalid' : ''}`} autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required />
          {fieldErr('password1')}
        </div>
        <div className="mb-3">
          <label className="form-label">Confirm new password</label>
          <input type="password" className={`form-control${errors.password2 ? ' is-invalid' : ''}`} autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
          {fieldErr('password2')}
        </div>
        <ul className="adm-hints mb-3">
          <li>At least 8 characters</li><li>Not a common password</li><li>Not only numbers</li>
        </ul>
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success">Change password</button>
        </div>
      </form>
    </Modal>
  )
}
