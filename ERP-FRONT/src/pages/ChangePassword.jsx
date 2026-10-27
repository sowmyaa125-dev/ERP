import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { confirmPasswordChange, requestPasswordChangeOtp } from '../api/auth'
import { errorMessage } from '../utils/format'

/**
 * First-login screen for accounts created with a temporary password.
 * Step 1 emails a 6-digit code; step 2 takes the code and the new password.
 */
export default function ChangePassword() {
  const { user, setUser, logout, loading } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState('send') // 'send' | 'verify'
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (loading) return <div className="container mt-5">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.must_change_password) return <Navigate to="/" replace />

  const sendCode = async () => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const res = await requestPasswordChangeOtp()
      setSentTo(res.data.email)
      setInfo(res.data.detail)
      setCooldown(res.data.resend_after || 60)
      setStep('verify')
    } catch (err) {
      if (err.response?.status === 429) {
        setCooldown(err.response.data.resend_after || 60)
        setStep('verify')
      }
      setError(errorMessage(err, 'Could not send the code.'))
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const res = await confirmPasswordChange({ code, new_password: password, confirm_password: confirm })
      setUser(res.data.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not change the password.'))
      setBusy(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #111827 0%, #14532d 100%)', padding: '1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%', maxWidth: '420px', border: 'none', borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)', overflow: 'hidden',
        }}
      >
        <div style={{ background: 'linear-gradient(135deg, #16a34a, #14532d)', color: '#fff', padding: '2rem 2rem 1.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '1.5rem',
            }}
          >
            🔒
          </div>
          <h2 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '0.2rem' }}>Set your new password</h2>
          <p style={{ fontSize: '0.8rem', opacity: 0.85, marginBottom: 0 }}>
            {user.company_name ? `${user.company_name} · ` : ''}{user.email}
          </p>
        </div>

        <div className="card-body" style={{ padding: '1.75rem 2rem 2rem' }}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          {info && !error && <div className="alert alert-success py-2">{info}</div>}

          {step === 'send' ? (
            <>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                You signed in with a temporary password. Before you continue, choose your own password.
                We&apos;ll email a 6-digit verification code to your registered address to confirm it&apos;s you.
              </p>
              <button className="btn btn-primary w-100" onClick={sendCode} disabled={busy}>
                {busy ? 'Sending...' : 'Send verification code'}
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Verification code</label>
                <input
                  className="form-control text-center fw-bold" style={{ letterSpacing: '0.5em', fontSize: '1.2rem' }}
                  inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" required
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <div className="form-text d-flex justify-content-between">
                  <span>{sentTo ? `Sent to ${sentTo}` : 'Check your email'} · valid 10 min</span>
                  <button type="button" className="btn btn-link p-0" style={{ fontSize: 'inherit' }}
                    disabled={cooldown > 0 || busy} onClick={sendCode}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">New password</label>
                <div className="input-group">
                  <input
                    type={showPassword ? 'text' : 'password'} className="form-control" autoComplete="new-password"
                    required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="form-text">At least 8 characters, not too common, not all numbers.</div>
              </div>
              <div className="mb-4">
                <label className="form-label">Confirm new password</label>
                <input
                  type={showPassword ? 'text' : 'password'} className="form-control" autoComplete="new-password"
                  required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={busy || code.length !== 6}>
                {busy ? 'Saving...' : 'Change password & continue'}
              </button>
            </form>
          )}

          <div className="text-center mt-3">
            <button className="btn btn-link btn-sm text-muted" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </div>
    </div>
  )
}
