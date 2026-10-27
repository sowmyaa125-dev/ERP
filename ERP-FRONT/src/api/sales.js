import apiClient from './client'

export const getQuotations = (params) => apiClient.get('/quotations/', { params })
export const createQuotation = (data) => apiClient.post('/quotations/', data)
export const updateQuotation = (id, data) => apiClient.put(`/quotations/${id}/`, data)
export const deleteQuotation = (id) => apiClient.delete(`/quotations/${id}/`)
export const quotationAction = (id, action) => apiClient.post(`/quotations/${id}/${action}/`)

export const getSalesOrders = (params) => apiClient.get('/sales-orders/', { params })
export const createSalesOrder = (data) => apiClient.post('/sales-orders/', data)
export const updateSalesOrder = (id, data) => apiClient.put(`/sales-orders/${id}/`, data)
export const deleteSalesOrder = (id) => apiClient.delete(`/sales-orders/${id}/`)
export const salesOrderAction = (id, action) => apiClient.post(`/sales-orders/${id}/${action}/`)

export const getSalesInvoices = (params) => apiClient.get('/sales-invoices/', { params })
export const createSalesInvoice = (data) => apiClient.post('/sales-invoices/', data)
export const cancelSalesInvoice = (id) => apiClient.post(`/sales-invoices/${id}/cancel/`)
export const getInvoicePrintData = (id) => apiClient.get(`/sales-invoices/${id}/print_data/`)
