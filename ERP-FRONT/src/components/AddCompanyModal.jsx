import { useState } from 'react'
import { getAllStates, getDistricts } from 'india-state-district'
import Modal from './Modal'
import CredentialsModal from './CredentialsModal'
import { createCompany } from '../api/companies'
import { errorMessage } from '../utils/format'

/**
 * Add a Main or Sub company.
 *   level 'SUPER'      - any type; a Main joins the chosen registered group, a Sub goes under any Main
 *   level 'REGISTERED' - Main companies in its own group, Subs under any Main in the group
 *   level 'MAIN'       - Subs under its own company only
 * companies: the list the user can see (from /companies/ or /admin/companies/).
 * initial: optional preset, e.g. { company_type: 'SUB', parent_company: 5 } or { company_type: 'MAIN', group: 1 }.
 */
export default function AddCompanyModal({ level, companies, ownCompanyId, initial = {}, onClose, onSaved }) {
  const canAddMain = level === 'SUPER' || level === 'REGISTERED'
  const [values, setValues] = useState({
    company_type: canAddMain ? 'MAIN' : 'SUB',
    group: '',
    parent_company: level === 'MAIN' ? ownCompanyId : '',
    name: '', legal_name: '', email: '', phone: '', gst_number: '',
    address: '', location: '', state: '', district: '', pin_code: '',
    admin_first_name: '', admin_last_name: '', admin_email: '', admin_password: '',
    ...initial,
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null) // saved company + its login, shown once before closing

  // Deactivated companies and self-registrations awaiting approval cannot receive new companies.
  const usable = companies.filter((c) => !['INACTIVE', 'REJECTED'].includes(c.status) && !c.awaiting_approval)
  const registered = usable.filter((c) => c.level === 'REGISTERED')
  const mains = usable.filter((c) => c.company_type === 'MAIN')
  const set = (name, value) => setValues((v) => ({ ...v, [name]: value, ...(name === 'state' ? { district: '' } : {}) }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const isMain = values.company_type === 'MAIN'
    try {
      const res = await createCompany({
        ...values,
        parent_company: isMain ? null : values.parent_company || null,
        group: isMain && level === 'SUPER' ? values.group || null : undefined,
      })
      setCreated(res.data)
    } catch (err) {
      setError(errorMessage(err, 'Failed to add company.'))
      setSaving(false)
    }
  }

  if (created) {
    return (
      <CredentialsModal
        credentials={{
          title: 'Company added',
          intro: `${created.name} has been added. Its admin can sign in with:`,
          ...created.credentials,
          emailSent: created.email_sent,
        }}
        onClose={() => onSaved(created)}
      />
    )
  }

  return (
    <Modal title="Add Company" size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger">{error}</div>}
        <h6 className="mb-2">Structure</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <label className="form-label">Company type *</label>
            <select className="form-select" value={values.company_type} disabled={!canAddMain}
              onChange={(e) => set('company_type', e.target.value)}>
              {canAddMain && <option value="MAIN">Main Company</option>}
              <option value="SUB">Sub Company</option>
            </select>
          </div>

          {values.company_type === 'MAIN' && level === 'SUPER' && (
            <div className="col-md-6">
              <label className="form-label">Belongs to (registered company) *</label>
              <select className="form-select" required value={values.group} onChange={(e) => set('group', e.target.value)}>
                <option value="">-- Select --</option>
                {registered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="form-text">For a brand-new customer with its own login, use Register Company instead.</div>
            </div>
          )}

          {values.company_type === 'SUB' && (
            <div className="col-md-6">
              <label className="form-label">Parent (Main) company *</label>
              <select className="form-select" required value={values.parent_company} disabled={level === 'MAIN'}
                onChange={(e) => set('parent_company', e.target.value)}>
                <option value="">-- Select --</option>
                {mains.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
              </select>
            </div>
          )}

        </div>

        <h6 className="mb-2">Company details</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <label className="form-label">Name *</label>
            <input className="form-control" required value={values.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Legal name</label>
            <input className="form-control" value={values.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Email *</label>
            <input type="email" className="form-control" required value={values.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Phone</label>
            <input className="form-control" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">GST number</label>
            <input className="form-control" value={values.gst_number} onChange={(e) => set('gst_number', e.target.value)} />
          </div>
        </div>

        <h6 className="mb-2">Address</h6>
        <div className="row g-3">
          <div className="col-md-8">
            <label className="form-label">Address</label>
            <input className="form-control" value={values.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Location</label>
            <input className="form-control" value={values.location} onChange={(e) => set('location', e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label">State</label>
            <select className="form-select" value={values.state} onChange={(e) => set('state', e.target.value)}>
              <option value="">-- Select --</option>
              {getAllStates().map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">District</label>
            <select className="form-select" value={values.district} disabled={!values.state} onChange={(e) => set('district', e.target.value)}>
              <option value="">-- Select --</option>
              {(values.state ? getDistricts(values.state) : []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Pin code</label>
            <input className="form-control" value={values.pin_code} onChange={(e) => set('pin_code', e.target.value)} />
          </div>
        </div>

        <h6 className="mt-4 mb-2">Company admin login</h6>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">First name</label>
            <input className="form-control" value={values.admin_first_name} onChange={(e) => set('admin_first_name', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Last name</label>
            <input className="form-control" value={values.admin_last_name} onChange={(e) => set('admin_last_name', e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Login email (username) *</label>
            <input type="email" className="form-control" required autoComplete="off" value={values.admin_email}
              onChange={(e) => set('admin_email', e.target.value)} />
            <div className="form-text">The sign-in link, password and verification code are sent here.</div>
          </div>
          <div className="col-md-6">
            <label className="form-label">Temporary password</label>
            <input className="form-control" autoComplete="off" placeholder="Leave blank to generate one" value={values.admin_password}
              onChange={(e) => set('admin_password', e.target.value)} />
            <div className="form-text">At least 8 characters. They must replace it at first sign-in.</div>
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Saving...' : 'Add Company & Create Login'}</button>
        </div>
      </form>
    </Modal>
  )
}
