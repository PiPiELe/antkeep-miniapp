const { request } = require('./api')

function fetchPrivacyAgreement() {
  return request('/api/public/agreements/privacy').then(agreement => {
    if (!agreement || [agreement.id, agreement.title, agreement.content].some(value => typeof value !== 'string' || !value.trim())) {
      throw new Error('隐私说明格式无效。')
    }
    return agreement
  })
}

module.exports = { fetchPrivacyAgreement }
