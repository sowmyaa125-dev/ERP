// The same frontend runs as two sites; each account may only use its own:
//   admin    - npm run dev:admin -> http://localhost:5174  Super Admins
//   company  - npm run dev       -> http://localhost:5173  Registered (main) companies and their Main / Sub companies
// On a server, set VITE_ADMIN_APP_URL / VITE_COMPANY_APP_URL at build time if the ports differ.
// Vite's --mode picks the site (see package.json scripts); plain `npm run dev` / `npm run build` is the company ERP.
export const APP_MODE = import.meta.env.MODE === 'admin' ? 'admin' : 'company'
export const IS_ADMIN_APP = APP_MODE === 'admin'

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const origin = (localPort, serverPort) =>
  `${window.location.protocol}//${window.location.hostname}:${isLocal ? localPort : serverPort}`

export const SITE_URLS = {
  admin: import.meta.env.VITE_ADMIN_APP_URL || origin(5174, 9065),
  company: import.meta.env.VITE_COMPANY_APP_URL || origin(5173, 9064),
}

export const SITE_LABELS = {
  admin: 'Super Admin portal',
  company: 'Company ERP',
}

/** Which site this account belongs to: Super Admins use the admin portal, every company user the ERP. */
export function siteFor(user) {
  return user.is_super_admin ? 'admin' : 'company'
}

export const loginUrlFor = (user) => `${SITE_URLS[siteFor(user)]}/login`

// How each portal looks, so it's obvious which one you are on.
export const PORTAL = {
  admin: {
    name: 'Super Admin portal', title: 'Super Admin Login', subtitle: 'Platform administration', icon: '🛡',
    page: 'linear-gradient(135deg, #0b0f19 0%, #1f2937 55%, #3f2d0c 100%)',
    header: 'linear-gradient(135deg, #1f2937, #0b0f19)', accent: '#d4a017',
  },
  company: {
    name: 'Company ERP', title: 'Company Login', subtitle: 'Registered, Main & Sub companies', icon: '🏢',
    page: 'linear-gradient(135deg, #111827 0%, #14532d 100%)',
    header: 'linear-gradient(135deg, #16a34a, #14532d)', accent: '#16a34a',
  },
}[APP_MODE]
