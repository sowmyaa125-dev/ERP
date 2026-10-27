import { useState } from 'react'
import { getAllStates, getDistricts } from 'india-state-district'
import Modal from './Modal'
import { registerCompany } from '../api/companies'
import { errorMessage } from '../utils/format'

const emptyRegistration = {
  name: '', legal_name: '', email: '', phone: '', gst_number: '', address: '', state: '', district: '', pin_code: '',
  admin_first_name: '', admin_last_name: '', admin_email: '', admin_password: '',
}

/**
 * Super Admin: register a company and create its admin login.
 * onRegistered(credentials) receives { title, intro, username, password, emailSent } for CredentialsModal.
 */
export default function RegisterCompanyModal({ onClose, onRegistered }) {
  const [registration, setRegistration] = useState(emptyRegistration)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setRegistration((prev) => ({ ...prev, [name]: value, ...(name === 'state' ? { district: '' } : {}) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await registerCompany(registration)
      onRegistered({
        title: 'Company registered',
        intro: `${res.data.company.name} can now sign in with:`,
        ...res.data.credentials,
        emailSent: res.data.email_sent,
      })
    } catch (err) {
      setError(errorMessage(err, 'Failed to register company.'))
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Register Company" size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-danger">{error}</div>}
        <h6 className="mb-2">Company details</h6>
        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <label className="form-label">Company name *</label>
            <input className="form-control" name="name" value={registration.name} onChange={handleChange} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">Legal name</label>
            <input className="form-control" name="legal_name" value={registration.legal_name} onChange={handleChange} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Company email *</label>
            <input type="email" className="form-control" name="email" value={registration.email} onChange={handleChange} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">Phone</label>
            <input className="form-control" name="phone" value={registration.phone} onChange={handleChange} />
          </div>
          <div className="col-md-4">
            <label className="form-label">State</label>
            <select className="form-select" name="state" value={registration.state} onChange={handleChange}>
              <option value="">-- Select --</option>
              {getAllStates().map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">District</label>
            <select className="form-select" name="district" value={registration.district} onChange={handleChange} disabled={!registration.state}>
              <option value="">-- Select --</option>
              {(registration.state ? getDistricts(registration.state) : []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Pin code</label>
            <input className="form-control" name="pin_code" value={registration.pin_code} onChange={handleChange} />
          </div>
          <div className="col-md-6">
            <label className="form-label">GST number</label>
            <input className="form-control" name="gst_number" value={registration.gst_number} onChange={handleChange} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Address</label>
            <input className="form-control" name="address" value={registration.address} onChange={handleChange} />
          </div>
        </div>

        <h6 className="mb-2">Company admin login</h6>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">First name</label>
            <input className="form-control" name="admin_first_name" value={registration.admin_first_name} onChange={handleChange} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Last name</label>
            <input className="form-control" name="admin_last_name" value={registration.admin_last_name} onChange={handleChange} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Login email (username) *</label>
            <input type="email" className="form-control" name="admin_email" value={registration.admin_email} onChange={handleChange} required />
            <div className="form-text">The verification code for the first password change goes here.</div>
          </div>
          <div className="col-md-6">
            <label className="form-label">Temporary password</label>
            <input className="form-control" name="admin_password" value={registration.admin_password} onChange={handleChange}
              placeholder="Leave blank to generate one" autoComplete="off" />
            <div className="form-text">They must replace it at first login.</div>
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 mt-4">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={submitting}>{submitting ? 'Registering...' : 'Register & Create Login'}</button>
        </div>
      </form>
    </Modal>
  )
}
