App({
  globalData: {
    session: null,
    publicContent: null
  },
  setSession(session) {
    this.globalData.session = session
  },
  clearSession() {
    this.globalData.session = null
  }
})
