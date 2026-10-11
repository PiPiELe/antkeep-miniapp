const { API_BASE_URL } = require('../config')

class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function request(path, options = {}) {
  const { method = 'GET', body, token } = options
  if (!/^\/api\//.test(path)) return Promise.reject(new ApiError('无效的接口路径。'))
  return new Promise((resolve, reject) => {
    const header = { Accept: 'application/json' }
    if (body !== undefined) header['Content-Type'] = 'application/json'
    if (token) header.Authorization = `Bearer ${token}`
    wx.request({
      url: API_BASE_URL + path,
      method,
      data: body,
      header,
      timeout: 15000,
      success(response) {
        const payload = response.data
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(payload)
          return
        }
        const message = payload && typeof payload.message === 'string' && payload.message.trim()
          ? payload.message : '请求失败，请稍后重试。'
        reject(new ApiError(message, response.statusCode, payload && payload.error))
      },
      fail() { reject(new ApiError('无法连接服务，请检查网络后重试。')) }
    })
  })
}

function authorizedRequest(path, options = {}) {
  const app = getApp()
  const session = app.globalData.session
  if (!session || !session.token) return Promise.reject(new ApiError('请先登录。', 401))
  return request(path, { ...options, token: session.token }).catch(error => {
    if (error.status === 401 && app.globalData.session === session) app.clearSession()
    throw error
  })
}

module.exports = { ApiError, request, authorizedRequest }
