import { AuthManager } from '../auth/manager'
import { ApiError, object } from '../api/asynctest/client'
import type { AuthReply, CredentialsReply } from '../auth/contracts'
import { PlatformManager } from '../platforms/manager'
import { handlePlatformMessage } from '../platforms/handler'
import { CaptureManager } from '../capture/manager'
import { CAPTURE_PORT, PAGE_RELAY_PORT } from '../capture/contracts'

export default defineBackground(() => {
  const auth = new AuthManager()
  const platforms = new PlatformManager(auth)
  let capture: CaptureManager | null = null
  let captureError = '捕获模块尚未就绪，请刷新扩展。'
  chrome.runtime.onConnect.addListener(port => {
    const sender = port.sender
    if (port.name === PAGE_RELAY_PORT && sender?.id === chrome.runtime.id && sender.tab) {
      if (capture) capture.connectRelay(port); else port.disconnect()
      return
    }
    if (port.name !== CAPTURE_PORT || sender?.id !== chrome.runtime.id || !sender.url
        || !sender.url.startsWith(chrome.runtime.getURL('')) || new URL(sender.url).pathname !== '/sidepanel.html') { port.disconnect(); return }
    if (!capture) { port.disconnect(); return }
    capture.connect(port)
  })
  const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  chrome.runtime.onMessage.addListener((input: unknown, sender, respond: (reply: AuthReply | CredentialsReply | { ok: true; data: unknown }) => void) => {
    const message = object(input)
    if (!['auth.state', 'auth.login', 'auth.logout', 'service.save', 'credentials.get', 'credentials.preference', 'platform.context', 'platform.projects', 'platform.authorize', 'platform.bind', 'platform.select', 'platform.unbind', 'platform.rename', 'capture.ready'].includes(String(message.type))) return
    // 仅接受本扩展 panel 发来的结构化命令，不提供任意 URL 代理。
    if (sender.id !== chrome.runtime.id || !sender.url || new URL(sender.url).pathname !== '/sidepanel.html'
        || !sender.url.startsWith(chrome.runtime.getURL(''))) return
    void storageReady.then(async (): Promise<AuthReply | CredentialsReply | { ok: true; data: unknown }> => {
      if (message.type === 'capture.ready') return { ok: true, data: { ready: !!capture, protocol: CAPTURE_PORT, message: capture ? '' : captureError } }
      if (String(message.type).startsWith('platform.')) return { ok: true, data: await handlePlatformMessage(platforms, message) }
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
  // Register core receivers first. A capture-only API/permission failure must not disable login or binding.
  try {
    if (!chrome.scripting?.executeScript || !chrome.webNavigation?.onBeforeNavigate) {
      captureError = '捕获所需的脚本或导航权限尚不可用，请重新加载扩展并确认新增权限。'
    } else {
      capture = new CaptureManager(platforms)
    }
  } catch (error) {
    captureError = `捕获模块初始化失败：${error instanceof Error ? error.message.slice(0, 180) : '请重新加载扩展。'}`
  }
})
