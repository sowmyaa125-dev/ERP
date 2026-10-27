import apiClient from './client'

export const getPayments = (params) => apiClient.get('/payments/', { params })
export const createPayment = (data) => apiClient.post('/payments/', data)
export const cancelPayment = (id) => apiClient.post(`/payments/${id}/cancel/`)
export const getLedger = (params) => apiClient.get('/ledger/', { params })
export const getOutstanding = (params) => apiClient.get('/outstanding/', { params })
