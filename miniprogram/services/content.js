function validText(value) { return typeof value === 'string' && value.trim() ? value : '' }

function normalizeContent(payload) {
  if (!payload || !Number.isInteger(payload.version) || payload.version < 1) {
    throw new Error('公共内容格式无效。')
  }
  const onboarding = payload.onboarding && typeof payload.onboarding === 'object' ? payload.onboarding : {}
  const texts = payload.texts && typeof payload.texts === 'object' && !Array.isArray(payload.texts) ? payload.texts : {}
  const articles = []
  Object.keys(texts).forEach(key => {
    const item = texts[key]
    if (!item || !validText(item.title) || !validText(item.body)) return
    articles.push({ id: key, title: item.title, body: item.body, kind: key === 'app.announcement' ? '公告' : key.startsWith('beginner-care.') ? '养护提示' : '文章' })
  })
  const steps = Array.isArray(onboarding.steps) ? onboarding.steps.filter(step => step && validText(step.id) && validText(step.title) && validText(step.body)).map(step => ({ id: step.id, title: step.title, body: step.body, kind: '入门资料' })) : []
  return {
    version: payload.version,
    publishedAt: payload.publishedAt || '',
    onboardingTitle: validText(onboarding.title),
    onboardingSummary: validText(onboarding.summary),
    steps,
    articles
  }
}

function findArticle(content, kind, id) {
  const list = kind === 'step' ? content.steps : content.articles
  return list.find(item => item.id === id)
}

module.exports = { normalizeContent, findArticle }
