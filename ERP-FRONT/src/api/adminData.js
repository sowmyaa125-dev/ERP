import apiClient from './client'

// Mirror of Django's /admin/ (Super Admin only). See ERP-BACK/adminpanel/views.py.
const base = (app, model) => `/admin/data/${app}/${model}`

export const getAdminIndex = () => apiClient.get('/admin/data/')
export const getChangeList = (app, model, params) => apiClient.get(`${base(app, model)}/`, { params })
export const runAction = (app, model, data) => apiClient.post(`${base(app, model)}/action/`, data)
export const getAddForm = (app, model) => apiClient.get(`${base(app, model)}/add/`)
export const getChangeForm = (app, model, pk) => apiClient.get(`${base(app, model)}/${pk}/`)
export const getDeletePreview = (app, model, pk) => apiClient.get(`${base(app, model)}/${pk}/delete/`)
export const deleteObject = (app, model, pk) => apiClient.post(`${base(app, model)}/${pk}/delete/`)
export const getHistory = (app, model, pk) => apiClient.get(`${base(app, model)}/${pk}/history/`)
export const changePassword = (app, model, pk, data) => apiClient.post(`${base(app, model)}/${pk}/password/`, data)

// Values go as JSON; when files are attached, as multipart with the JSON under "payload".
export function saveObject(app, model, pk, values, files) {
  const url = pk ? `${base(app, model)}/${pk}/` : `${base(app, model)}/add/`
  const fileEntries = Object.entries(files || {}).filter(([, f]) => f)
  if (!fileEntries.length) return apiClient.post(url, values)
  const body = new FormData()
  body.append('payload', JSON.stringify(values))
  fileEntries.forEach(([name, file]) => body.append(name, file))
  return apiClient.post(url, body)
}
