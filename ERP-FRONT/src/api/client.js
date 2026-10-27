import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api'
    : `${window.location.protocol}//${window.location.hostname}:9063/api`
)

const apiClient = axios.create({
  baseURL: apiBaseUrl,
})

// Attach the access token to every request, if we have one
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// One refresh at a time: several requests can fail with 401 together when the
// access token expires, and they must all wait for the same new token. Running
// them in parallel would reuse a refresh token the backend has just rotated
// and blacklisted, which logs the user out.
let refreshPromise = null

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${apiClient.defaults.baseURL}/auth/token/refresh/`, { refresh: localStorage.getItem('refresh_token') })
      .then((response) => {
        localStorage.setItem('access_token', response.data.access)
        // ROTATE_REFRESH_TOKENS is on: the old refresh token is now blacklisted, keep the new one.
        if (response.data.refresh) localStorage.setItem('refresh_token', response.data.refresh)
        return response.data.access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// Sign out locally and send the user to the login page with the reason.
function endSession(reason) {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  if (window.location.pathname !== '/login') window.location.assign(`/login?reason=${reason}`)
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const data = error.response?.data

    // Temporary-password accounts are locked out of everything until they set a new password.
    if (error.response?.status === 403 && data?.code === 'password_change_required') {
      if (window.location.pathname !== '/change-password') window.location.assign('/change-password')
      return Promise.reject(error)
    }

    if (error.response?.status !== 401) return Promise.reject(error)

    // Wrong email/password on the login form, or the refresh call itself: let the caller show it.
    const url = originalRequest?.url || ''
    if (url.includes('/auth/login/') || url.includes('/auth/token/')) return Promise.reject(error)

    if (data?.code === 'company_inactive') {
      endSession('inactive')
      return Promise.reject(error)
    }

    // No tokens (signed out, possibly in another tab) or already retried once: the session is over.
    if (!localStorage.getItem('refresh_token') || originalRequest._retry) {
      endSession('expired')
      return Promise.reject(error)
    }

    originalRequest._retry = true
    try {
      const access = await refreshAccessToken()
      originalRequest.headers.Authorization = `Bearer ${access}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      endSession('expired')
      return Promise.reject(refreshError)
    }
  }
)

export default apiClient
