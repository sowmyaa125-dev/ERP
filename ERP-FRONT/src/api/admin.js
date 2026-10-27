import apiClient from './client'

// Super Admin console (/api/admin/) — every call requires is_super_admin.
export const getAdminSummary = () => apiClient.get('/admin/summary/')
export const getAdminCompanies = () => apiClient.get('/admin/companies/')
export const setCompanyStatus = (id, status) => apiClient.post(`/admin/companies/${id}/status/`, { status })

export const getAdminUsers = (params) => apiClient.get('/admin/users/', { params })
export const createAdminUser = (data) => apiClient.post('/admin/users/', data)
export const updateAdminUser = (id, data) => apiClient.patch(`/admin/users/${id}/`, data)
export const resetUserPassword = (id) => apiClient.post(`/admin/users/${id}/reset-password/`)

export const getPendingRegistrations = () => apiClient.get('/auth/pending-registrations/')
export const approveRegistration = (userId) => apiClient.post(`/auth/approve/${userId}/`)
export const rejectRegistration = (userId, reason) => apiClient.post(`/auth/reject/${userId}/`, { reason })
