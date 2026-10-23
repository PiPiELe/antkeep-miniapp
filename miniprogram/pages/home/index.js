const { fetchPublicContent } = require('../../services/content')

Page({
  data: { loading: true, error: '', empty: false, content: null },
  onLoad() { this.loadContent() },
  onPullDownRefresh() { this.loadContent().finally(() => wx.stopPullDownRefresh()) },
  loadContent() {
    const sequence = (this._loadSequence || 0) + 1
    this._loadSequence = sequence
    this.setData({ loading: true, error: '' })
    return fetchPublicContent().then(content => {
      if (sequence !== this._loadSequence) return
      getApp().globalData.publicContent = content
      this.setData({ content, empty: !content.articles.length && !content.steps.length, loading: false })
    }).catch(error => {
      if (sequence !== this._loadSequence) return
      getApp().globalData.publicContent = null
      this.setData({ content: null, empty: error.code === 'CONTENT_NOT_PUBLISHED', error: error.code === 'CONTENT_NOT_PUBLISHED' ? '' : error.message, loading: false })
    })
  },
  openArticle(event) {
    const { kind, id } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/article/index?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}` })
  }
})
