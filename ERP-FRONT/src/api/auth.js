import apiClient from './client'

export const requestPasswordChangeOtp = () => apiClient.post('/auth/password-change/request-otp/')
export const confirmPasswordChange = (data) => apiClient.post('/auth/password-change/confirm/', data)
