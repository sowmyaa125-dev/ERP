import apiClient from './client'

export const getBranches = () => apiClient.get('/branches/')
export const createBranch = (data) => apiClient.post('/branches/', data)
export const updateBranch = (id, data) => apiClient.patch(`/branches/${id}/`, data)
