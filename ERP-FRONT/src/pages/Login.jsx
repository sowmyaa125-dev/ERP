import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { APP_MODE, IS_ADMIN_APP, PORTAL, SITE_LABELS, SITE_URLS, siteFor } from '../appMode'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { login, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const notice = {
    expired: 'Your session has ended. Please sign in again.',
    inactive: 'Your company account is inactive. Please contact the administrator.',
  }[searchParams.get('reason')]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await login(email, password)
      // Super Admins use the admin portal (5174); every company user uses the company ERP (5173).
      const site = siteFor(user)
      if (site !== APP_MODE) {
        logout()
        setError(<>This account signs in at the {SITE_LABELS[site]}: <a href={`${SITE_URLS[site]}/login`}>{SITE_URLS[site]}</a></>)
        return
      }
      // New company admins sign in with a temporary password and must replace it first.
      navigate(user.must_change_password ? '/change-password' : IS_ADMIN_APP ? '/admin-dashboard' : '/')
    } catch (err) {
      setError(
        err.response?.data?.detail || 'Invalid email or password.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: PORTAL.page,
        padding: '1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '380px',
          border: 'none',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: PORTAL.header,
            borderBottom: `3px solid ${PORTAL.accent}`,
            color: '#fff',
            padding: '2rem 2rem 1.5rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.15)',
              border: `2px solid ${PORTAL.accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.75rem',
              fontSize: '1.5rem',
              fontWeight: 800,
            }}
          >
            {PORTAL.icon}
          </div>
          <h2 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '0.2rem' }}>
            {PORTAL.title}
          </h2>
          <p style={{ fontSize: '0.8rem', opacity: 0.85, marginBottom: 0 }}>
            {PORTAL.subtitle}
          </p>
        </div>

        <div className="card-body" style={{ padding: '1.75rem 2rem 2rem' }}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          {!error && notice && <div className="alert alert-warning py-2">{notice}</div>}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="you@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={submitting}
              style={{ background: PORTAL.accent, borderColor: PORTAL.accent, color: IS_ADMIN_APP ? '#111827' : '#fff' }}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}