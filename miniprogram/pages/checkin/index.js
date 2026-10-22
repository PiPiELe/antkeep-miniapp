const { authorizedRequest } = require('../../services/api')

Page({
  data: { signedIn: false, loading: false, submitting: false, summary: null, error: '' },
  onShow() {
    const session = getApp().globalData.session
    if (session && this.data.submitting && this._submittingSession === session) return
    this._requestSequence = (this._requestSequence || 0) + 1
    this._requestSession = session
    this._submittingSession = null
    const signedIn = !!session
    this.setData({ signedIn, summary: null, error: '', loading: false, submitting: false })
    if (signedIn) this.loadSummary()
  },
  onUnload() {
    this._requestSequence = (this._requestSequence || 0) + 1
    this._requestSession = null
    this._submittingSession = null
  },
  onPullDownRefresh() {
    const task = this.data.signedIn ? this.loadSummary() : Promise.resolve()
    task.finally(() => wx.stopPullDownRefresh())
  },
  _handleExpiredSession(session, error) {
    // A stale request may still invalidate the session used by newer requests.
    if (!session || error.status !== 401 || this._requestSession !== session || getApp().globalData.session !== null) return false
    this._requestSequence = (this._requestSequence || 0) + 1
    this._requestSession = null
    this._submittingSession = null
    this.setData({ signedIn: false, summary: null, error: error.message, loading: false, submitting: false })
    return true
  },
  loadSummary() {
    if (this.data.submitting) return Promise.resolve()
    const app = getApp()
    const session = app.globalData.session
    const sequence = (this._requestSequence || 0) + 1
    this._requestSequence = sequence
    this._requestSession = session
    const current = () => sequence === this._requestSequence && app.globalData.session === session
    this.setData({ loading: true, error: '' })
    return authorizedRequest('/api/app/check-ins/summary').then(summary => {
      if (current()) this.setData({ summary })
    }).catch(error => {
      if (this._handleExpiredSession(session, error)) return
      if (current()) this.setData({ signedIn: !!app.globalData.session, summary: null, error: error.message })
    }).finally(() => {
      if (current()) this.setData({ loading: false })
    })
  },
  checkIn() {
    if (this.data.submitting || this.data.loading || !this.data.signedIn || !this.data.summary || this.data.summary.checkedInToday) return
    const app = getApp()
    const session = app.globalData.session
    const sequence = (this._requestSequence || 0) + 1
    this._requestSequence = sequence
    this._requestSession = session
    this._submittingSession = session
    const current = () => sequence === this._requestSequence && app.globalData.session === session
    this.setData({ submitting: true, error: '' })
    return authorizedRequest('/api/app/check-ins', { method: 'POST' }).then(summary => {
      if (!current()) return
      this.setData({ summary })
      wx.showToast({ title: '签到成功', icon: 'success' })
    }).catch(error => {
      if (this._handleExpiredSession(session, error)) return
      if (!current()) return
      this._submittingSession = null
      this.setData({ signedIn: !!app.globalData.session, summary: null, error: error.message, submitting: false })
      if (this.data.signedIn) return this.loadSummary()
    }).finally(() => {
      if (current()) {
        this._submittingSession = null
        this.setData({ submitting: false })
      }
    })
  },
  goLogin() { wx.navigateTo({ url: '/pages/auth/index' }) }
})
