import { AuthManager } from '../auth/manager'
import { ApiError, object } from '../api/asynctest/client'
import type { AuthReply, CredentialsReply } from '../auth/contracts'

export default defineBackground(() => {
  const auth = new AuthManager()
  const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  chrome.runtime.onMessage.addListener((input: unknown, sender, respond: (reply: AuthReply | CredentialsReply) => void) => {
    const message = object(input)
    if (!['auth.state', 'auth.login', 'auth.logout', 'service.save', 'credentials.get', 'credentials.preference'].includes(String(message.type))) return
    // 仅接受本扩展 panel 发来的结构化命令，不提供任意 URL 代理。
    if (sender.id !== chrome.runtime.id || !sender.url || new URL(sender.url).pathname !== '/sidepanel.html'
        || !sender.url.startsWith(chrome.runtime.getURL(''))) return
    void storageReady.then(async (): Promise<AuthReply | CredentialsReply> => {
      if (message.type === 'credentials.get' || message.type === 'credentials.preference') {
        if (typeof message.serviceUrl !== 'string') throw new ApiError('input', '服务地址不完整。')
        if (message.type === 'credentials.preference' && typeof message.enabled !== 'boolean') throw new ApiError('input', '记住密码设置不完整。')
        return { ok: true, credentials: message.type === 'credentials.get' ? await auth.remembered(message.serviceUrl) : await auth.rememberPreference(message.serviceUrl, message.enabled === true) }
      }
      const state = await (async () => {
      switch (message.type) {
        case 'auth.state': return auth.snapshot(message.force === true)
        case 'auth.login':
          if (typeof message.serviceUrl !== 'string' || typeof message.username !== 'string' || typeof message.password !== 'string') throw new ApiError('input', '登录参数不完整。')
          return auth.login(message.serviceUrl, message.username, message.password, message.remember === true)
        case 'auth.logout':
          if (typeof message.serviceUrl !== 'string' || typeof message.sessionId !== 'string') throw new ApiError('input', '退出参数不完整。')
          return auth.logout(message.serviceUrl, message.sessionId)
        case 'service.save': {
          const config = object(message.service)
          if (typeof config.name !== 'string' || typeof config.url !== 'string') throw new ApiError('input', '服务配置不完整。')
          return auth.configure({ name: config.name, url: config.url })
        }
        default: throw new ApiError('input', '未知操作。')
      }
      })()
      return { ok: true, state }
    }).then(respond).catch((error: unknown) => {
      respond({ ok: false, error: { kind: error instanceof ApiError ? error.kind : 'storage', message: error instanceof ApiError ? error.message : '无法读取或保存登录信息，请重试。' } })
    })
    return true
  })
  // Toolbar clicks open the native panel directly; no popup is registered.
  const configurePanel = () => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) => console.error('Unable to configure panel behavior', error))
  }

  chrome.runtime.onInstalled.addListener(configurePanel)
  chrome.runtime.onStartup.addListener(configurePanel)
  configurePanel()
})
