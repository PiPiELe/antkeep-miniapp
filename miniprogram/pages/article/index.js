const { request } = require('../../services/api')
const { normalizeContent, findArticle } = require('../../services/content')

Page({
  data: { loading: true, error: '', article: null },
  onLoad(options) {
    this.kind = options.kind
    this.id = options.id
    this.loadArticle()
  },
  loadArticle() {
    const cached = getApp().globalData.publicContent
    if (cached) {
      this.showArticle(cached)
      return Promise.resolve()
    }
    this.setData({ loading: true, error: '' })
    return request('/api/public/content').then(payload => {
      const content = normalizeContent(payload)
      getApp().globalData.publicContent = content
      this.showArticle(content)
    }).catch(error => this.setData({ loading: false, error: error.message }))
  },
  showArticle(content) {
    const article = findArticle(content, this.kind, this.id)
    if (!article) return this.setData({ loading: false, article: null, error: '这篇内容已不可用。' })
    wx.setNavigationBarTitle({ title: article.kind })
    this.setData({ loading: false, article, error: '' })
  }
})
