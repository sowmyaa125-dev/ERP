import apiClient from './client'

export const getPurchaseOrders = (params) => apiClient.get('/purchase-orders/', { params })
export const getPurchaseOrder = (id) => apiClient.get(`/purchase-orders/${id}/`)
export const createPurchaseOrder = (data) => apiClient.post('/purchase-orders/', data)
export const updatePurchaseOrder = (id, data) => apiClient.put(`/purchase-orders/${id}/`, data)
export const deletePurchaseOrder = (id) => apiClient.delete(`/purchase-orders/${id}/`)
export const approvePurchaseOrder = (id) => apiClient.post(`/purchase-orders/${id}/approve/`)
export const cancelPurchaseOrder = (id) => apiClient.post(`/purchase-orders/${id}/cancel/`)

export const getGoodsReceipts = (params) => apiClient.get('/goods-receipts/', { params })
export const createGoodsReceipt = (data) => apiClient.post('/goods-receipts/', data)
export const cancelGoodsReceipt = (id) => apiClient.post(`/goods-receipts/${id}/cancel/`)

export const getPurchaseBills = (params) => apiClient.get('/purchase-bills/', { params })
export const createPurchaseBill = (data) => apiClient.post('/purchase-bills/', data)
export const cancelPurchaseBill = (id) => apiClient.post(`/purchase-bills/${id}/cancel/`)
