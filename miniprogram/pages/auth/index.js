const { request } = require('../../services/api')

const USERNAME = /^[a-z0-9_\u3400-\u4DBF\u4E00-\u9FFF]{3,32}$/
// A newer account page or attempt supersedes requests from older instances.
let authSequence = 0

Page({
  data: {
    mode: 'login', username: '', password: '', inviteCode: '',
    inviteRequired: false, policyReady: false, policyError: '',
    privacy: null, privacyError: '', accepted: false, loading: true,
    submitting: false, error: ''
  },
  onLoad() {
    this._unloaded = false
    ++authSequence
    this.loadPolicies()
  },
  onUnload() { this._unloaded = true },
  loadPolicies() {
    this.setData({ loading: true, policyError: '', privacyError: '', error: '' })
    const privacy = request('/api/public/agreements/privacy').then(value => {
      if (this._unloaded) return
      if (!value || !value.id || !value.title || !value.content) throw new Error('隐私说明格式无效。')
      this.setData({ privacy: value, accepted: false })
    }).catch(error => {
      if (!this._unloaded) this.setData({ privacy: null, accepted: false, privacyError: error.code === 'PRIVACY_AGREEMENT_NOT_PUBLISHED' ? '隐私说明尚未发布，暂不能使用账号功能。' : error.message })
    })
    const policy = request('/api/public/registration-policy').then(value => {
      if (!this._unloaded) this.setData({ inviteRequired: value.inviteCodeRequired === true, policyReady: true })
    }).catch(error => {
      if (!this._unloaded) this.setData({ policyReady: false, policyError: error.message })
    })
    return Promise.all([privacy, policy]).then(() => {
      if (!this._unloaded) this.setData({ loading: false })
    })
  },
  chooseLogin() { this.setData({ mode: 'login', error: '' }) },
  chooseRegister() { this.setData({ mode: 'register', error: '' }) },
  usernameInput(event) { this.setData({ username: event.detail.value }) },
  passwordInput(event) { this.setData({ password: event.detail.value }) },
  inviteInput(event) { this.setData({ inviteCode: event.detail.value }) },
  toggleAccepted() { this.setData({ accepted: !this.data.accepted }) },
  goPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }) },
  async submit() {
    if (this.data.submitting || this.data.loading) return
    const { mode, password, accepted, privacy, inviteRequired, policyReady } = this.data
    const username = this.data.username.trim().toLowerCase()
    const inviteCode = this.data.inviteCode.trim()
    if (!USERNAME.test(username)) return this.setData({ error: '用户名须为 3–32 位汉字、字母、数字或下划线。' })
    if (Array.from(password).length < 8 || Array.from(password).length > 64) return this.setData({ error: '密码须为 8–64 个字符。' })
    if (!privacy || !accepted) return this.setData({ error: '请先阅读并同意当前隐私说明。' })
    if (mode === 'register' && (!policyReady || (inviteRequired && !inviteCode))) return this.setData({ error: policyReady ? '请输入邀请码。' : '注册规则尚未加载，请重试。' })

    const sequence = ++authSequence
    const app = getApp()
    let expectedSession = app.globalData.session
    const current = () => !this._unloaded && sequence === authSequence && app.globalData.session === expectedSession
    this.setData({ submitting: true, error: '' })
    try {
      const latest = await request('/api/public/agreements/privacy')
      if (!current()) return
      if (latest.id !== privacy.id) {
        this.setData({ privacy: latest, accepted: false, error: '隐私说明已更新，请重新阅读并同意。' })
        return
      }
      // 仅记录同意版本，不保存密码或登录令牌。
      wx.setStorageSync('privacyConsent', { publicationId: privacy.id, version: privacy.version, username, acceptedAt: new Date().toISOString() })
      if (mode === 'register') {
        await request('/api/app/auth/register', { method: 'POST', body: { username, password, ...(inviteCode ? { inviteCode } : {}) } })
        if (!current()) return
      }
      const session = await request('/api/app/auth/login', { method: 'POST', body: { username, password } })
      if (!current()) return
      if (!session || !session.token || !session.user || !session.user.username) throw new Error('登录响应格式无效。')
      app.setSession(session)
      expectedSession = session
      this.setData({ password: '', inviteCode: '' })
      wx.showToast({ title: mode === 'register' ? '注册并登录成功' : '登录成功', icon: 'success' })
      if (getCurrentPages().length > 1) wx.navigateBack()
      else wx.switchTab({ url: '/pages/checkin/index' })
    } catch (error) {
      if (current()) this.setData({ error: error.message || '操作失败，请稍后重试。' })
    } finally {
      if (current()) this.setData({ submitting: false })
    }
  }
})
