import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from './Layout'
import { APP_MODE, loginUrlFor, siteFor } from '../appMode'

// `bare` skips the sidebar layout (used for printable pages).
export default function ProtectedRoute({ children, bare = false }) {
  const { user, loading, logout } = useAuth()
  // Signed in on another account's site (e.g. an older session): sign out and go to the right one.
  const wrongSite = Boolean(user) && siteFor(user) !== APP_MODE

  useEffect(() => {
    if (!wrongSite) return
    const target = loginUrlFor(user)
    logout()
    window.location.replace(target)
  }, [wrongSite, user, logout])

  if (loading) return <div className="container mt-5">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (wrongSite) return <div className="container mt-5">Redirecting to your sign-in page…</div>
  if (user.must_change_password) return <Navigate to="/change-password" replace />

  return bare ? children : <Layout>{children}</Layout>
}
