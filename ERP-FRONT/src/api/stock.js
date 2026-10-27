import apiClient from './client'

export const getStockBalances = () => apiClient.get('/stock-balances/')
export const getStockMovements = () => apiClient.get('/stock-movements/')
export const postOpeningStock = (data) => apiClient.post('/stock/opening/', data)
export const postStockAdjustment = (data) => apiClient.post('/stock/adjustment/', data)
export const postStockTransfer = (data) => apiClient.post('/stock/transfer/', data)