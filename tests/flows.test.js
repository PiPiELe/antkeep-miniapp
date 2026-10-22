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

const definitions = {}
function newPage(name) {
  if (!definitions[name]) {
    global.Page = definition => { definitions[name] = definition }
    const path = `../miniprogram/pages/${name}/index`
    delete require.cache[require.resolve(path)]
    require(path)
  }
  return {
    ...definitions[name], data: structuredClone(definitions[name].data), writes: [],
    setData(value) { this.writes.push(value); Object.assign(this.data, value) }
  }
}

function newApp(session = null) {
  return {
    globalData: { session },
    setSession(value) { this.globalData.session = value },
    clearSession() { this.globalData.session = null }
  }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
const agreement = { id: 'privacy-1', version: 1, title: '隐私说明', content: '正文' }
const account = name => ({ token: name, user: { id: name, username: name } })
const summary = (days, checkedInToday = false) => ({ date: '2026-10-22', checkedInToday, totalDays: days, consecutiveDays: days })

for (const stage of ['privacy', 'register', 'login']) {
  test(`离开账号页后不继续 ${stage} 阶段的认证流程`, async () => {
    const app = newApp()
    global.getApp = () => app
    global.getCurrentPages = () => [{}, {}]
    let pending, navigations = 0, toasts = 0
    const requests = []
    global.wx = {
      request(options) {
        const path = new URL(options.url).pathname
        requests.push(path)
        const data = path.endsWith('/agreements/privacy') ? agreement : path.endsWith('/auth/register') ? {} : account('account_a')
        if ((stage === 'privacy' && path.endsWith('/agreements/privacy')) || path.endsWith(`/auth/${stage}`)) {
          pending = () => options.success({ statusCode: 200, data })
        } else options.success({ statusCode: 200, data })
      },
      setStorageSync() {}, showToast() { toasts++ },
      navigateBack() { navigations++ }, switchTab() { navigations++ }
    }
    const page = newPage('auth')
    page.setData({ mode: stage === 'register' ? 'register' : 'login', username: 'account_a', password: 'password123', privacy: agreement, accepted: true, policyReady: true, loading: false })
    const task = page.submit()
    await settle()
    assert.equal(typeof pending, 'function')
    page.onUnload?.()
    const writes = page.writes.length
    pending()
    await task
    assert.equal(app.globalData.session, null)
    assert.equal(navigations, 0)
    assert.equal(toasts, 0)
    assert.equal(page.writes.length, writes)
    if (stage !== 'login') assert.equal(requests.includes('/api/app/auth/login'), false)
  })
}

test('较早账号页的登录结果不能覆盖较新账号页的会话', async () => {
  const app = newApp()
  global.getApp = () => app
  global.getCurrentPages = () => [{}, {}]
  const pending = {}
  let navigations = 0
  global.wx = {
    request(options) {
      if (options.url.endsWith('/agreements/privacy')) options.success({ statusCode: 200, data: agreement })
      else pending[options.data.username] = options
    },
    setStorageSync() {}, showToast() {}, navigateBack() { navigations++ }
  }
  const older = newPage('auth'), newer = newPage('auth')
  for (const [page, username] of [[older, 'account_a'], [newer, 'account_b']]) {
    page.setData({ username, password: 'password123', privacy: agreement, accepted: true, loading: false })
  }
  const oldTask = older.submit()
  await settle()
  const newTask = newer.submit()
  await settle()
  pending.account_b.success({ statusCode: 200, data: account('account_b') })
  await newTask
  pending.account_a.success({ statusCode: 200, data: account('account_a') })
  await oldTask
  assert.equal(app.globalData.session.token, 'account_b')
  assert.equal(navigations, 1)
})

test('打开新的账号页即使尚未提交也会使旧登录结果失效', async () => {
  const app = newApp()
  global.getApp = () => app
  global.getCurrentPages = () => [{}, {}]
  let pending, navigations = 0
  global.wx = {
    request(options) {
      if (options.url.endsWith('/auth/login')) pending = options
      else options.success({ statusCode: 200, data: options.url.endsWith('/registration-policy') ? { inviteCodeRequired: false } : agreement })
    },
    setStorageSync() {}, showToast() {}, navigateBack() { navigations++ }
  }
  const older = newPage('auth')
  older.setData({ username: 'account_a', password: 'password123', privacy: agreement, accepted: true, loading: false })
  const task = older.submit()
  await settle()
  const newer = newPage('auth')
  newer.onLoad()
  pending.success({ statusCode: 200, data: account('account_a') })
  await task
  assert.equal(app.globalData.session, null)
  assert.equal(navigations, 0)
})

for (const succeeds of [true, false]) {
  test(`卸载账号页后忽略协议和规则请求的${succeeds ? '结果' : '错误'}`, async () => {
    const pending = []
    global.wx = { request(options) { pending.push(options) } }
    const page = newPage('auth')
    const task = page.loadPolicies()
    page.onUnload?.()
    const writes = page.writes.length
    for (const options of pending) {
      if (succeeds) options.success({ statusCode: 200, data: options.url.endsWith('/registration-policy') ? { inviteCodeRequired: false } : agreement })
      else options.fail()
    }
    await task
    assert.equal(page.writes.length, writes)
  })
}

for (const method of ['GET', 'POST']) {
  for (const outcome of ['success', 'network', '401']) {
    test(`切换账号后丢弃旧签到 ${method} 的 ${outcome} 及加载状态`, async () => {
      for (const oldFinishesFirst of [true, false]) {
        const app = newApp(account('account_a'))
        global.getApp = () => app
        const pending = []
        let toasts = 0
        global.wx = { request(options) { pending.push(options) }, showToast() { toasts++ } }
        const page = newPage('checkin')
        page.onShow()
        let old = pending[0]
        if (method === 'POST') {
          old.success({ statusCode: 200, data: summary(1) })
          await settle()
          page.checkIn()
          old = pending[1]
          assert.equal(old.method, 'POST')
        }
        app.setSession(account('account_b'))
        page.onShow()
        const latest = pending.at(-1)
        const completeOld = () => outcome === 'success'
          ? old.success({ statusCode: 200, data: summary(321, true) })
          : outcome === '401'
            ? old.success({ statusCode: 401, data: { message: '旧会话已过期' } })
            : old.fail()
        if (!oldFinishesFirst) {
          latest.success({ statusCode: 200, data: summary(2) })
          await settle()
        }
        completeOld()
        await settle()
        if (oldFinishesFirst) {
          assert.equal(page.data.loading, true)
          assert.equal(page.data.summary, null)
          latest.success({ statusCode: 200, data: summary(2) })
          await settle()
        }
        assert.equal(app.globalData.session.token, 'account_b')
        assert.deepEqual(page.data.summary, summary(2))
        assert.equal(page.data.signedIn, true)
        assert.equal(page.data.loading, false)
        assert.equal(page.data.submitting, false)
        assert.equal(page.data.error, '')
        assert.equal(toasts, 0)
        assert.equal(pending.at(-1), latest)
      }
    })
  }
}

test('同一会话的旧签到摘要不能覆盖较新的结果', async () => {
  const app = newApp(account('account_a'))
  global.getApp = () => app
  const pending = []
  global.wx = { request(options) { pending.push(options) } }
  const page = newPage('checkin')
  const older = page.loadSummary(), newer = page.loadSummary()
  pending[1].success({ statusCode: 200, data: summary(2, true) })
  await newer
  pending[0].success({ statusCode: 200, data: summary(1) })
  await older
  assert.deepEqual(page.data.summary, summary(2, true))
})

test('当前签到会话失效时显示游客并结束提交状态', async () => {
  const app = newApp(account('account_a'))
  global.getApp = () => app
  const pending = []
  global.wx = { request(options) { pending.push(options) } }
  const page = newPage('checkin')
  page.onShow()
  pending[0].success({ statusCode: 200, data: summary(1) })
  await settle()
  page.checkIn()
  pending[1].success({ statusCode: 401, data: { message: '当前会话已过期' } })
  await settle()
  assert.equal(app.globalData.session, null)
  assert.equal(page.data.signedIn, false)
  assert.equal(page.data.summary, null)
  assert.equal(page.data.loading, false)
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.error, '当前会话已过期')
  assert.equal(pending.length, 2)
})

test('签到提交期间不发出可覆盖提交结果的摘要刷新', async () => {
  const app = newApp(account('account_a'))
  global.getApp = () => app
  const pending = []
  let toasts = 0
  global.wx = { request(options) { pending.push(options) }, showToast() { toasts++ } }
  const page = newPage('checkin')
  page.onShow()
  pending[0].success({ statusCode: 200, data: summary(1) })
  await settle()
  const task = page.checkIn()
  const refresh = page.loadSummary()
  assert.equal(pending.length, 2)
  await refresh
  pending[1].success({ statusCode: 200, data: summary(2, true) })
  await task
  assert.deepEqual(page.data.summary, summary(2, true))
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.loading, false)
  assert.equal(toasts, 1)
  page.checkIn()
  assert.equal(pending.length, 2)
})

test('当前签到响应丢失后仍回查摘要并结束加载状态', async () => {
  const app = newApp(account('account_a'))
  global.getApp = () => app
  const pending = []
  global.wx = { request(options) { pending.push(options) } }
  const page = newPage('checkin')
  page.onShow()
  pending[0].success({ statusCode: 200, data: summary(1) })
  await settle()
  page.checkIn()
  pending[1].fail()
  await settle()
  assert.equal(pending.length, 3)
  assert.equal(page.data.loading, true)
  assert.equal(page.data.submitting, false)
  pending[2].success({ statusCode: 200, data: summary(2, true) })
  await settle()
  assert.deepEqual(page.data.summary, summary(2, true))
  assert.equal(page.data.loading, false)
  assert.equal(page.data.submitting, false)
})

for (const succeeds of [true, false]) {
  test(`旧账号退出${succeeds ? '成功' : '失败'}后保留新账号页面状态`, async () => {
    const app = newApp(account('account_a'))
    global.getApp = () => app
    let pending, toasts = 0
    global.wx = { request(options) { pending = options }, showToast() { toasts++ } }
    const page = newPage('mine')
    page.onShow()
    const task = page.logout()
    assert.equal(app.globalData.session, null)
    app.setSession(account('account_b'))
    page.onShow()
    if (succeeds) pending.success({ statusCode: 200, data: { ok: true } })
    else pending.fail()
    await task
    assert.equal(page.data.session, app.globalData.session)
    assert.equal(page.data.session.token, 'account_b')
    assert.equal(page.data.loggingOut, false)
    assert.equal(page.data.error, '')
    assert.equal(toasts, 0)
  })
}

for (const outcome of ['success', 'network', '401']) {
  test(`同一会话切换标签后仍完成正在进行的签到 ${outcome}`, async () => {
    const app = newApp(account('account_a'))
    global.getApp = () => app
    const pending = []
    let toasts = 0
    global.wx = { request(options) { pending.push(options) }, showToast() { toasts++ } }
    const page = newPage('checkin')
    page.onShow()
    pending[0].success({ statusCode: 200, data: summary(1) })
    await settle()
    const task = page.checkIn()
    page.onShow()
    assert.equal(pending.length, 2)
    assert.equal(page.data.submitting, true)
    assert.equal(page.data.loading, false)
    page.checkIn()
    assert.equal(pending.length, 2)
    if (outcome === 'success') pending[1].success({ statusCode: 200, data: summary(2, true) })
    else if (outcome === '401') pending[1].success({ statusCode: 401, data: { message: '当前会话已过期' } })
    else {
      pending[1].fail()
      await settle()
      assert.equal(pending.length, 3)
      pending[2].success({ statusCode: 200, data: summary(2, true) })
    }
    await task
    assert.equal(page.data.loading, false)
    assert.equal(page.data.submitting, false)
    assert.equal(page.data.signedIn, outcome !== '401')
    assert.deepEqual(page.data.summary, outcome === '401' ? null : summary(2, true))
    assert.equal(toasts, outcome === 'success' ? 1 : 0)
    if (outcome === '401') assert.equal(app.globalData.session, null)
  })
}

for (const outcome of ['success', '401']) {
  test(`同账号的新令牌不接收旧签到提交的 ${outcome}`, async () => {
    const app = newApp(account('account_a'))
    global.getApp = () => app
    const pending = []
    let toasts = 0
    global.wx = { request(options) { pending.push(options) }, showToast() { toasts++ } }
    const page = newPage('checkin')
    page.onShow()
    pending[0].success({ statusCode: 200, data: summary(1) })
    await settle()
    const task = page.checkIn()
    app.setSession({ ...account('account_a'), token: 'replacement-token' })
    page.onShow()
    assert.equal(pending.length, 3)
    assert.equal(pending[2].header.Authorization, 'Bearer replacement-token')
    pending[1].success({ statusCode: outcome === 'success' ? 200 : 401, data: outcome === 'success' ? summary(321, true) : { message: '旧令牌失效' } })
    await task
    assert.equal(page.data.loading, true)
    assert.equal(page.data.summary, null)
    pending[2].success({ statusCode: 200, data: summary(2) })
    await settle()
    assert.equal(app.globalData.session.token, 'replacement-token')
    assert.deepEqual(page.data.summary, summary(2))
    assert.equal(page.data.loading, false)
    assert.equal(page.data.submitting, false)
    assert.equal(toasts, 0)
  })
}

for (const next of ['loaded', 'loading', 'submitting']) {
  test(`旧摘要的401清除当前会话时同步游客状态 ${next}`, async () => {
    const app = newApp(account('account_a'))
    global.getApp = () => app
    const pending = []
    let toasts = 0
    global.wx = { request(options) { pending.push(options) }, showToast() { toasts++ } }
    const page = newPage('checkin')
    page.onShow()
    const newer = page.loadSummary()
    let submission
    if (next !== 'loading') {
      pending[1].success({ statusCode: 200, data: summary(1) })
      await newer
      if (next === 'submitting') submission = page.checkIn()
    }
    pending[0].success({ statusCode: 401, data: { message: '当前会话已过期' } })
    await settle()
    assert.equal(app.globalData.session, null)
    assert.equal(page.data.signedIn, false)
    assert.equal(page.data.summary, null)
    assert.equal(page.data.loading, false)
    assert.equal(page.data.submitting, false)
    assert.equal(page.data.error, '当前会话已过期')
    if (next === 'loading') {
      pending[1].success({ statusCode: 200, data: summary(2) })
      await newer
    } else if (submission) {
      pending[2].success({ statusCode: 200, data: summary(2, true) })
      await submission
    }
    assert.equal(page.data.signedIn, false)
    assert.equal(page.data.summary, null)
    assert.equal(toasts, 0)
  })
}

test('页面卸载后当前摘要401也不再更新页面', async () => {
  const app = newApp(account('account_a'))
  global.getApp = () => app
  let pending
  global.wx = { request(options) { pending = options } }
  const page = newPage('checkin')
  page.onShow()
  page.onUnload()
  const writes = page.writes.length
  pending.success({ statusCode: 401, data: { message: '当前会话已过期' } })
  await settle()
  assert.equal(app.globalData.session, null)
  assert.equal(page.writes.length, writes)
})
