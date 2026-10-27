import apiClient from './client'

export const getSuppliers = () => apiClient.get('/suppliers/')
export const createSupplier = (data) => apiClient.post('/suppliers/', data)
export const updateSupplier = (id, data) => apiClient.patch(`/suppliers/${id}/`, data)