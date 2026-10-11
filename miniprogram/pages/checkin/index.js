const { authorizedRequest } = require('../../services/api')

Page({
  data: { signedIn: false, loading: false, submitting: false, summary: null, error: '' },
  onShow() {
    const signedIn = !!getApp().globalData.session
    this.setData({ signedIn, summary: null, error: '' })
    if (signedIn) this.loadSummary()
  },
  onPullDownRefresh() {
    const task = this.data.signedIn ? this.loadSummary() : Promise.resolve()
    task.finally(() => wx.stopPullDownRefresh())
  },
  loadSummary() {
    this.setData({ loading: true, error: '' })
    return authorizedRequest('/api/app/check-ins/summary').then(summary => {
      this.setData({ summary, loading: false })
    }).catch(error => {
      this.setData({ signedIn: !!getApp().globalData.session, summary: null, error: error.message, loading: false })
    })
  },
  checkIn() {
    if (this.data.submitting || this.data.loading || !this.data.signedIn || !this.data.summary || this.data.summary.checkedInToday) return
    this.setData({ submitting: true, error: '' })
    authorizedRequest('/api/app/check-ins', { method: 'POST' }).then(summary => {
      this.setData({ summary, submitting: false })
      wx.showToast({ title: '签到成功', icon: 'success' })
    }).catch(error => {
      this.setData({ signedIn: !!getApp().globalData.session, summary: null, error: error.message, submitting: false })
      if (this.data.signedIn) this.loadSummary()
    })
  },
  goLogin() { wx.navigateTo({ url: '/pages/auth/index' }) }
})
