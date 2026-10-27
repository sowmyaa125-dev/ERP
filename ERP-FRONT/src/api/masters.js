import apiClient from './client'
export const updateGroup = (id, data) => apiClient.patch(`/groups/${id}/`, data)
export const updateSubGroup = (id, data) => apiClient.patch(`/sub-groups/${id}/`, data)
export const updateCategory = (id, data) => apiClient.patch(`/categories/${id}/`, data)
export const updateSubCategory = (id, data) => apiClient.patch(`/sub-categories/${id}/`, data)
export const updateBrand = (id, data) => apiClient.patch(`/brands/${id}/`, data)
export const updateUnit = (id, data) => apiClient.patch(`/unit-masters/${id}/`, data)
export const updateGstMaster = (id, data) => apiClient.patch(`/gst-masters/${id}/`, data)
export const updateWarehouse = (id, data) => apiClient.patch(`/warehouses/${id}/`, data)
export const getGroups = () => apiClient.get('/groups/')
export const createGroup = (data) => apiClient.post('/groups/', data)

export const getSubGroups = () => apiClient.get('/sub-groups/')
export const createSubGroup = (data) => apiClient.post('/sub-groups/', data)

export const getCategories = () => apiClient.get('/categories/')
export const createCategory = (data) => apiClient.post('/categories/', data)

export const getSubCategories = () => apiClient.get('/sub-categories/')
export const createSubCategory = (data) => apiClient.post('/sub-categories/', data)

export const getBrands = () => apiClient.get('/brands/')
export const createBrand = (data) => apiClient.post('/brands/', data)

export const getUnits = () => apiClient.get('/unit-masters/')
export const createUnit = (data) => apiClient.post('/unit-masters/', data)

export const getGstMasters = () => apiClient.get('/gst-masters/')
export const createGstMaster = (data) => apiClient.post('/gst-masters/', data)

export const getWarehouses = () => apiClient.get('/warehouses/')
export const createWarehouse = (data) => apiClient.post('/warehouses/', data)