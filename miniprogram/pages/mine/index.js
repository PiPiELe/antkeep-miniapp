const { authorizedRequest } = require('../../services/api')

Page({
  data: { session: null, loggingOut: false, error: '' },
  onShow() { this.setData({ session: getApp().globalData.session, error: '' }) },
  goLogin() { wx.navigateTo({ url: '/pages/auth/index' }) },
  goPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }) },
  logout() {
    if (this.data.loggingOut) return
    this.setData({ loggingOut: true, error: '' })
    authorizedRequest('/api/app/auth/logout', { method: 'POST' }).then(() => {
      getApp().clearSession()
      this.setData({ session: null, loggingOut: false })
      wx.showToast({ title: '已退出登录', icon: 'success' })
    }).catch(error => {
      this.setData({ session: getApp().globalData.session, loggingOut: false, error: error.message })
    })
  }
})
