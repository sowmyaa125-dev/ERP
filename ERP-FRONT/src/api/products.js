import apiClient from './client'

export const getProducts = () => apiClient.get('/products/')
export const createProduct = (data) => apiClient.post('/products/', data)
export const updateProduct = (id, data) => apiClient.patch(`/products/${id}/`, data)