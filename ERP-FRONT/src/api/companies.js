import apiClient from './client'

export const getCompanies = () => apiClient.get('/companies/')
export const createCompany = (data) => apiClient.post('/companies/', data)
export const updateCompany = (id, data) => apiClient.patch(`/companies/${id}/`, data)
export const registerCompany = (data) => apiClient.post('/companies/register/', data)
