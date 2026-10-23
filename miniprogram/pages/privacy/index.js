const { fetchPrivacyAgreement } = require('../../services/privacy')

Page({
  data: { loading: true, error: '', agreement: null },
  onLoad() { this.loadAgreement() },
  loadAgreement() {
    this.setData({ loading: true, error: '' })
    return fetchPrivacyAgreement().then(agreement => this.setData({ agreement, loading: false })).catch(error => this.setData({ agreement: null, loading: false, error: error.code === 'PRIVACY_AGREEMENT_NOT_PUBLISHED' ? '隐私说明尚未发布。' : error.message }))
  }
})
