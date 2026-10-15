const test = require('node:test')
const assert = require('node:assert/strict')
const { request, authorizedRequest } = require('../miniprogram/services/api')
const { normalizeContent, findArticle } = require('../miniprogram/services/content')

test('公开内容保留公告、养护提示和新手步骤，可按标识打开', () => {
  const content = normalizeContent({
    version: 4,
    publishedAt: '2026-10-10T00:00:00Z',
    onboarding: { title: '入门', summary: '从观察开始', steps: [{ id: 'first', title: '第一步', body: '观察蚁群' }] },
    texts: {
      'app.announcement': { title: '公告', body: '服务更新' },
      'beginner-care.a': { title: '养护提醒', body: '留意水分' }
    }
  })
  assert.equal(content.articles.length, 2)
  assert.equal(findArticle(content, 'article', 'beginner-care.a').body, '留意水分')
  assert.equal(findArticle(content, 'step', 'first').kind, '入门资料')
  assert.throws(() => normalizeContent({ version: 0 }), /格式无效/)
})

test('Bearer 请求遇到 401 清除当前会话', async () => {
  const app = { globalData: { session: { token: 'temporary' } }, clearSession() { this.globalData.session = null } }
  global.getApp = () => app
  global.wx = { request(options) {
    assert.equal(options.header.Authorization, 'Bearer temporary')
    options.success({ statusCode: 401, data: { error: 'UNAUTHORIZED', message: '会话已过期' } })
  } }
  await assert.rejects(authorizedRequest('/api/app/check-ins/summary'), error => error.status === 401 && error.message === '会话已过期')
  assert.equal(app.globalData.session, null)
  await assert.rejects(authorizedRequest('/api/app/check-ins/summary'), /请先登录/)
})

test('注册前核对隐私版本，成功后只把令牌留在运行内存', async () => {
  let stored
  const paths = []
  const app = { globalData: { session: null }, setSession(session) { this.globalData.session = session } }
  global.getApp = () => app
  global.getCurrentPages = () => [{}, {}]
  global.wx = {
    request(options) {
      const path = new URL(options.url).pathname
      paths.push(path)
      const data = path.endsWith('/agreements/privacy')
        ? { id: 'agreement-1', version: 2, title: '隐私说明', content: '隐私正文' }
        : path.endsWith('/registration-policy')
          ? { inviteCodeRequired: true }
          : path.endsWith('/auth/register')
            ? { id: 'user-1', username: '蚂蚁_ant' }
            : { token: 'memory-only', user: { id: 'user-1', username: '蚂蚁_ant' } }
      if (path.endsWith('/auth/register')) assert.deepEqual(options.data, { username: '蚂蚁_ant', password: 'password123', inviteCode: 'INVITE' })
      options.success({ statusCode: path.endsWith('/auth/register') ? 201 : 200, data })
    },
    setStorageSync(key, value) { assert.equal(key, 'privacyConsent'); stored = value },
    showToast() {},
    navigateBack() {}
  }
  global.Page = definition => { global.pageDefinition = definition }
  require('../miniprogram/pages/auth/index')
  const page = { ...global.pageDefinition, data: { ...global.pageDefinition.data }, setData(value) { Object.assign(this.data, value) } }
  await page.loadPolicies()
  page.setData({ mode: 'register', username: '蚁友', password: 'password123', inviteCode: 'INVITE', accepted: true })
  await page.submit()
  assert.match(page.data.error, /3–32 位/)
  assert.equal(paths.length, 2)
  page.setData({ username: '蚂蚁_Ant' })
  await page.submit()
  assert.equal(app.globalData.session.token, 'memory-only')
  assert.deepEqual(stored, { publicationId: 'agreement-1', version: 2, username: '蚂蚁_ant', acceptedAt: stored.acceptedAt })
  assert.equal(JSON.stringify(stored).includes('memory-only'), false)
  assert.deepEqual(paths, ['/api/public/agreements/privacy', '/api/public/registration-policy', '/api/public/agreements/privacy', '/api/app/auth/register', '/api/app/auth/login'])
})

test('隐私版本在提交前更新时，拒绝继续登录', async () => {
  let requests = 0
  const app = { globalData: { session: null } }
  global.getApp = () => app
  global.wx = {
    request(options) {
      const path = new URL(options.url).pathname
      if (path.endsWith('/auth/login')) throw new Error('不应发送登录请求')
      if (path.endsWith('/agreements/privacy')) requests++
      options.success({ statusCode: 200, data: path.endsWith('/agreements/privacy')
        ? { id: requests === 1 ? 'old' : 'new', version: requests, title: '隐私说明', content: '正文' }
        : { inviteCodeRequired: false } })
    },
    setStorageSync() { throw new Error('不应记录旧版本同意') }
  }
  const definition = global.pageDefinition
  const page = { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value) } }
  await page.loadPolicies()
  page.setData({ username: 'ant_user', password: 'password123', accepted: true })
  await page.submit()
  assert.equal(page.data.accepted, false)
  assert.match(page.data.error, /隐私说明已更新/)
  assert.equal(app.globalData.session, null)
})

test('退出请求失败仍立即清除本机会话', async () => {
  const app = { globalData: { session: { token: 'temporary' } }, clearSession() { this.globalData.session = null } }
  global.getApp = () => app
  global.wx = { request(options) {
    assert.equal(options.header.Authorization, 'Bearer temporary')
    options.fail()
  } }
  global.Page = definition => { global.pageDefinition = definition }
  require('../miniprogram/pages/mine/index')
  const page = { ...global.pageDefinition, data: { ...global.pageDefinition.data }, setData(value) { Object.assign(this.data, value) } }
  page.onShow()
  const task = page.logout()
  assert.equal(app.globalData.session, null)
  assert.equal(page.data.session, null)
  await task
  assert.match(page.data.error, /本机退出/)
})

test('旧内容请求不能覆盖较新的刷新结果', async () => {
  const pending = []
  const app = { globalData: { publicContent: null } }
  global.getApp = () => app
  global.wx = { request(options) { pending.push(options) } }
  global.Page = definition => { global.pageDefinition = definition }
  require('../miniprogram/pages/home/index')
  const page = { ...global.pageDefinition, data: { ...global.pageDefinition.data }, setData(value) { Object.assign(this.data, value) } }
  const older = page.loadContent()
  const newer = page.loadContent()
  pending[1].success({ statusCode: 200, data: { version: 2, texts: { notice: { title: '新版', body: '新内容' } } } })
  await newer
  pending[0].success({ statusCode: 200, data: { version: 1, texts: { notice: { title: '旧版', body: '旧内容' } } } })
  await older
  assert.equal(page.data.content.version, 2)
  assert.equal(app.globalData.publicContent.version, 2)

  const staleFailure = page.loadContent()
  const latest = page.loadContent()
  pending[3].success({ statusCode: 200, data: { version: 3, texts: { notice: { title: '最新版', body: '最新内容' } } } })
  await latest
  pending[2].fail()
  await staleFailure
  assert.equal(page.data.content.version, 3)
  assert.equal(app.globalData.publicContent.version, 3)
})
