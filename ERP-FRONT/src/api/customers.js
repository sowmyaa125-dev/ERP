import apiClient from './client'

export const getCustomers = () => apiClient.get('/customers/')
export const createCustomer = (data) => apiClient.post('/customers/', data)
export const updateCustomer = (id, data) => apiClient.patch(`/customers/${id}/`, data)