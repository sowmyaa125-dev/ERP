import apiClient from './client'

export const getDashboardReport = (params) => apiClient.get('/reports/dashboard/', { params })
export const getSalesReport = (params) => apiClient.get('/reports/sales/', { params })
export const getPurchaseReport = (params) => apiClient.get('/reports/purchases/', { params })
export const getGstReport = (params) => apiClient.get('/reports/gst/', { params })
export const getStockReport = (params) => apiClient.get('/reports/stock/', { params })
