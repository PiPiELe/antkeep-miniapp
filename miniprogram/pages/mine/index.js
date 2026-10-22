const { authorizedRequest } = require('../../services/api')

Page({
  data: { session: null, loggingOut: false, error: '' },
  onShow() { this.setData({ session: getApp().globalData.session, error: '' }) },
  goLogin() { wx.navigateTo({ url: '/pages/auth/index' }) },
  goPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }) },
  logout() {
    if (this.data.loggingOut) return
    const app = getApp()
    // Keep the request's token, then end the local session even if the server is unavailable.
    const logout = authorizedRequest('/api/app/auth/logout', { method: 'POST' })
    app.clearSession()
    this.setData({ session: null, loggingOut: true, error: '' })
    return logout.then(() => {
      this.setData({ session: app.globalData.session, loggingOut: false })
      if (!app.globalData.session) wx.showToast({ title: '已退出登录', icon: 'success' })
    }).catch(() => {
      this.setData({ session: app.globalData.session, loggingOut: false, error: app.globalData.session ? '' : '已在本机退出；服务器会话未确认撤销，将按原有效期失效。' })
    })
  }
})
