import { object } from '../api/asynctest/client'
import { AUTH_STORAGE_PREFIX, serviceOriginPattern } from '../auth/contracts'
import { SERVICE_STORAGE_KEY } from '../settings/service'
import { PLATFORM_STORAGE_PREFIX } from '../platforms/contracts'
import type { PlatformManager } from '../platforms/manager'
import { CAPTURE_LIMIT, BODY_LIMIT, BODY_TIMEOUT, PAGE_RELAY_PORT, type CapturedRequest, type CapturedInput, type CapturedResponse, type CaptureSnapshot, type CaptureDetail, type PageCaptureOptions } from './contracts'
import { installPageCapture, stopPageCapture } from './pageHook'
import { installPageRelay, stopPageRelay } from './pageRelay'
import { parseInput, parseBody, parseHeaders } from './requestData'

type Peer = { port: chrome.runtime.Port; windowId?: number; visible: boolean; detailId?: number }
type Frame = { id: number; documentId: string; nonce: string; url: string; port?: chrome.runtime.Port; installed: boolean }
type RunningCapture = { key: string; tabId: number; windowId: number; url: string; documentId: string; accepting: boolean; frames: Map<number, Frame>; refreshing: boolean }
type RecordEntry = { request: CapturedInput; row: CapturedRequest; response: CapturedResponse; frame: Frame; requestId: string }
const emptyResponse = (): CapturedResponse => ({ state: 'pending', status: null, statusText: '', contentType: '', url: '', encoding: 'none', bytes: 0, message: '', body: '', headers: { entries: [], state: 'unreadable', message: '等待响应头。' } })

// One rolling buffer across page changes; only adding the 21st record evicts the oldest.
// Body data stays in memory. The page bridge has no access to credentials or API commands.
export class CaptureManager {
  private peers = new Set<Peer>()
  private active: RunningCapture | null = null
  private entries: RecordEntry[] = []
  private focusTimer: ReturnType<typeof setTimeout> | undefined
  private sequence = 0
  private generation = 0
  private processing = false
  private pending = false
  private watchedTab: number | undefined
  private navigating = new Set<number>()
  private reportWindow: number | undefined
  private status: CaptureSnapshot['status'] = 'idle'
  private message = ''
  private publishTimer: ReturnType<typeof setTimeout> | undefined
  private checkTimer: ReturnType<typeof setInterval> | undefined

  constructor(private platforms: PlatformManager) {
    chrome.tabs.onActivated.addListener(info => {
      if (this.hasPeer(info.windowId) && info.tabId !== this.watchedTab) {
        this.watchedTab = info.tabId
        this.reconcileSoon(true)
      }
    })
    chrome.tabs.onUpdated.addListener((tabId, changes) => {
      if (changes.status === 'complete') this.navigating.delete(tabId)
      if (tabId !== this.watchedTab) return
      // Tab loading notifications can come from subframes. Only top-level navigation
      // or an actual address change invalidates this page's capture.
      if (changes.url !== undefined && this.active && changes.url !== this.active.url) {
        this.reconcileSoon(true)
      } else if (changes.url !== undefined || changes.status === 'complete') {
        this.reconcileSoon()
      }
    })
    chrome.tabs.onRemoved.addListener(tabId => {
      this.navigating.delete(tabId)
      if (tabId === this.watchedTab) { this.watchedTab = undefined; this.reconcileSoon(true) }
    })
    chrome.windows.onFocusChanged.addListener(windowId => {
      clearTimeout(this.focusTimer)
      if (windowId === this.active?.windowId) return
      this.detach()
      // Chrome can briefly report WINDOW_ID_NONE while focus moves between its surfaces.
      // Stop immediately, but resolve the actual focused window before choosing the next capture target.
      this.focusTimer = setTimeout(() => this.reconcileSoon(), 150)
    })
    chrome.webNavigation.onBeforeNavigate.addListener(event => {
      if (event.frameId === 0 && event.tabId === this.watchedTab) {
        this.navigating.add(event.tabId)
        this.reconcileSoon(true)
      }
    })
    chrome.webNavigation.onCommitted.addListener(event => {
      if (event.frameId === 0) {
        this.navigating.delete(event.tabId)
        if (event.tabId !== this.watchedTab) return
        const run = this.active
        const sameDocument = run?.documentId === event.documentId
        this.reconcileSoon(!!run && (!sameDocument || event.url !== run.url))
      } else if (this.active?.tabId === event.tabId) this.refreshSoon(this.active)
    })
    const routeChanged = (event: { tabId: number; frameId: number; url: string }) => {
      if (event.frameId === 0 && event.tabId === this.watchedTab) {
        // replaceState/pushState may update history state without changing the URL.
        // Those notifications must not discard requests from the current page.
        if (this.active?.url === event.url) return
        this.reconcileSoon(!!this.active)
      } else if (event.frameId !== 0 && this.active?.tabId === event.tabId) this.refreshSoon(this.active)
    }
    chrome.webNavigation.onHistoryStateUpdated.addListener(routeChanged)
    chrome.webNavigation.onReferenceFragmentUpdated.addListener(routeChanged)
    chrome.webNavigation.onErrorOccurred.addListener(event => {
      if (event.frameId === 0 && event.tabId === this.watchedTab) {
        this.navigating.delete(event.tabId)
        this.reconcileSoon()
      }
    })
    chrome.permissions.onRemoved.addListener(() => { this.detach(); this.reconcileSoon() })
    chrome.storage.onChanged.addListener((changes, area) => {
      const relevant = Object.entries(changes).some(([key, change]) => {
        if (area === 'session') return key.startsWith('platform-choice:')
        if (area !== 'local') return false
        if (key === SERVICE_STORAGE_KEY || key.startsWith(PLATFORM_STORAGE_PREFIX)) return true
        if (key.startsWith(AUTH_STORAGE_PREFIX)) {
          const before = object(change.oldValue), after = object(change.newValue)
          return before.id !== after.id || before.token !== after.token
        }
        return false
      })
      if (relevant) {
        this.detach()
        this.reconcileSoon()
      }
    })
  }

  connect(port: chrome.runtime.Port) {
    const peer: Peer = { port, visible: false }
    this.peers.add(peer)
    port.onMessage.addListener(input => {
      const message = object(input)
      if (message.type === 'watch' && Number.isInteger(message.windowId) && Number(message.windowId) >= 0) {
        peer.windowId = Number(message.windowId); peer.visible = message.visible === true
        this.reconcileSoon()
      } else if (message.type === 'visibility' && peer.visible !== (message.visible === true)) {
        peer.visible = message.visible === true
        if (this.active && !this.hasPeer(this.active.windowId)) this.detach()
        this.reconcileSoon()
      } else if (message.type === 'retry') { this.detach(); this.reconcileSoon() }
      else if (message.type === 'detail') {
        peer.detailId = Number.isSafeInteger(message.id) ? Number(message.id) : undefined
        this.sendDetail(peer)
      }
      // Heartbeats keep the MV3 worker alive; revalidation has its own 30-second cadence.
    })
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError
      this.peers.delete(peer)
      if (!this.peers.size) { clearInterval(this.checkTimer); this.checkTimer = undefined }
      if (this.active && !this.hasPeer(this.active.windowId)) this.detach()
      this.reconcileSoon()
    })
    if (!this.checkTimer) this.checkTimer = setInterval(() => this.reconcileSoon(), 30000)
    this.publish()
  }

  connectRelay(port: chrome.runtime.Port) {
    const sender = port.sender, run = this.active
    const frame = run?.frames.get(sender?.frameId ?? -1)
    if (!run?.accepting || !frame || sender?.id !== chrome.runtime.id || sender.tab?.id !== run.tabId || sender.documentId !== frame.documentId) { port.disconnect(); return }
    let accepted = false
    const timer = setTimeout(() => { if (!accepted) port.disconnect() }, 5000)
    port.onMessage.addListener(input => {
      const message = object(input)
      if (this.active !== run || !run.accepting || run.frames.get(frame.id) !== frame || message.nonce !== frame.nonce) { port.disconnect(); return }
      if (message.type === 'hello' && !accepted && !frame.port) {
        accepted = true; clearTimeout(timer); frame.port = port
        this.send(port, { type: 'ready' })
      } else if (accepted && message.type === 'event') this.receive(frame, object(message.data))
    })
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError; clearTimeout(timer)
      if (frame.port !== port) return
      frame.port = undefined; frame.installed = false
      if (this.active === run && run.accepting) {
        if (frame.id === 0) {
          run.accepting = false
          for (const child of run.frames.values()) { this.stopFrame(run, child); this.finishFrame(child) }
          this.setStatus('interrupted', '采集通道已中断，已有记录保留，可重试监听。')
        } else {
          this.finishFrame(frame)
          this.setStatus('listening', '正在采集响应；部分 iframe 未连接。')
        }
      }
    })
  }
  private send(port: chrome.runtime.Port, data: object) { try { port.postMessage(data) } catch {} }
  private hasPeer(windowId: number) { return [...this.peers].some(peer => peer.visible && peer.windowId === windowId) }
  private setStatus(status: CaptureSnapshot['status'], message: string) { this.status = status; this.message = message; this.publish() }
  private sendDetail(peer: Peer) {
    if (peer.detailId === undefined) return
    const entry = this.entries.find(entry => entry.row.id === peer.detailId)
    this.send(peer.port, { kind: 'detail', id: peer.detailId, request: entry?.request || null, response: entry?.response || null } satisfies CaptureDetail)
  }
  private publish() {
    clearTimeout(this.publishTimer); this.publishTimer = undefined
    for (const peer of this.peers) {
      const relevant = peer.visible && peer.windowId === this.reportWindow
      this.send(peer.port, { status: relevant ? this.status : 'idle', message: relevant ? this.message : '仅监听当前活动页面。', rows: this.entries.map(entry => entry.row) } satisfies CaptureSnapshot)
    }
  }
  private reconcileSoon(stopImmediately = false) {
    ++this.generation
    if (stopImmediately) {
      this.detach()
      this.setStatus('checking', '正在检查页面授权与绑定…')
    }
    this.pending = true
    if (!this.processing) void this.drain()
  }
  private async drain() {
    this.processing = true
    try {
      while (this.pending) {
        this.pending = false
        const generation = this.generation
        try { await this.reconcile(generation) }
        catch (error) {
          if (generation !== this.generation) continue
          this.detach()
          this.setStatus('error', error instanceof Error ? error.message : '无法开始监听，请重试。')
        }
      }
    } finally { this.processing = false }
  }
  private refreshSoon(run: RunningCapture) {
    void this.refreshFrames(run).catch(() => {
      if (this.active === run) {
        this.detach()
        this.setStatus('error', '无法读取页面框架，已有记录保留，请重试监听。')
      }
    })
  }
  private current(generation: number) { return generation === this.generation }
  private stopFrame(run: RunningCapture, frame: Frame) {
    const port = frame.port
    frame.port = undefined; frame.installed = false
    if (port) { this.send(port, { type: 'stop' }); try { port.disconnect() } catch {} }
    const target = { tabId: run.tabId, documentIds: [frame.documentId] }
    void chrome.scripting.executeScript({ target, world: 'ISOLATED', func: stopPageRelay, args: [frame.nonce] }).catch(() => {})
    void chrome.scripting.executeScript({ target, world: 'MAIN', func: stopPageCapture, args: [frame.nonce] }).catch(() => {})
  }
  private detach(run = this.active) {
    if (this.active === run) this.active = null
    if (!run) return
    run.accepting = false
    for (const frame of run.frames.values()) { this.stopFrame(run, frame); this.finishFrame(frame) }
  }
  private async reconcile(generation: number) {
    if (this.active && !this.active.accepting) this.detach()
    if (![...this.peers].some(peer => peer.visible)) {
      this.detach(); this.setStatus('idle', 'panel 已暂停，监听已停止。'); return
    }
    const window = await chrome.windows.getLastFocused()
    if (!this.current(generation)) return
    if (!window.focused || window.id === undefined || !this.hasPeer(window.id)) {
      this.detach(); this.setStatus('stopped', '窗口未激活，监听已暂停，已有记录保留。'); return
    }
    this.reportWindow = window.id
    const [tab] = await chrome.tabs.query({ active: true, windowId: window.id })
    if (!this.current(generation)) return
    this.watchedTab = tab?.id
    if (tab?.id === undefined || !tab.url || this.navigating.has(tab.id) || (tab.pendingUrl && tab.pendingUrl !== tab.url)) {
      this.detach(); this.setStatus('checking', '等待页面切换完成…'); return
    }
    if (!this.active) this.setStatus('checking', '正在检查页面授权与绑定…')
    const { context, owner } = await this.platforms.captureContext(window.id)
    if (!this.current(generation)) return
    if (context.status !== 'bound' || !context.page || !context.rule || !context.selected || context.page.tabId !== tab.id) {
      this.detach(); this.setStatus('stopped', '当前页面尚未完成授权和项目绑定。'); return
    }
    const latest = await chrome.tabs.get(tab.id)
    if (!this.current(generation)) return
    if (!latest.active || latest.url !== tab.url || (latest.pendingUrl && latest.pendingUrl !== latest.url)) { this.reconcileSoon(true); return }
    const document = await chrome.webNavigation.getFrame({ tabId: tab.id, frameId: 0 })
    if (!this.current(generation)) return
    if (!document?.documentId || document.url !== tab.url) {
      this.detach(); this.setStatus('checking', '等待主页面加载完成…'); return
    }
    const key = JSON.stringify([owner, tab.id, document.documentId, tab.url, context.rule.id, context.selected.id])
    if (this.active?.key === key && this.active.accepting) { await this.refreshFrames(this.active); this.publish(); return }
    this.detach()
    const run: RunningCapture = { key, tabId: tab.id, windowId: window.id, url: tab.url, documentId: document.documentId, accepting: true, frames: new Map(), refreshing: false }
    this.active = run
    await this.refreshFrames(run)
    if (this.active !== run) { this.detach(run); return }
    // A queued read-only recheck (for example tabs.onUpdated complete) does not
    // invalidate the installed hooks. The next drain pass reuses this same run.
    if (!this.current(generation)) return
    if (!run.frames.get(0)?.installed) throw new Error('页面拦截未能安装，请刷新页面后重试。')
  }
  private async refreshFrames(run: RunningCapture) {
    if (run.refreshing || this.active !== run || !run.accepting) return
    run.refreshing = true
    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: run.tabId })
      if (this.active !== run || !run.accepting) return
      const main = frames?.find(frame => frame.frameId === 0)
      if (main?.documentId !== run.documentId || main.url !== run.url) { this.reconcileSoon(true); return }
      let partial = false
      for (const [id, frame] of run.frames) {
        if (!frames?.some(info => info.frameId === id && info.documentId === frame.documentId)) {
          this.stopFrame(run, frame); this.finishFrame(frame); run.frames.delete(id)
        }
      }
      for (const info of frames || []) {
        if (this.active !== run || !run.accepting) return
        const previous = run.frames.get(info.frameId)
        if (previous?.documentId === info.documentId && previous.url === info.url && previous.installed) continue
        if (previous) { this.stopFrame(run, previous); this.finishFrame(previous); run.frames.delete(info.frameId) }
        if (!info.documentId || !/^https?:\/\//i.test(info.url)) { partial = true; continue }
        const permitted = await chrome.permissions.contains({ origins: [serviceOriginPattern(info.url)] })
        if (this.active !== run || !run.accepting) return
        if (!permitted || (info.frameId === 0 && info.url !== run.url)) { partial = true; continue }
        const frame: Frame = { id: info.frameId, documentId: info.documentId, nonce: crypto.randomUUID(), url: info.url, installed: false }
        run.frames.set(frame.id, frame)
        const target = { tabId: run.tabId, documentIds: [frame.documentId] }
        const options: PageCaptureOptions = { nonce: frame.nonce, url: frame.url, maxBytes: BODY_LIMIT, maxRows: CAPTURE_LIMIT, bodyTimeout: BODY_TIMEOUT, requestTimeout: 30000, leaseMs: 15000, relayPort: PAGE_RELAY_PORT }
        try {
          const relay = await chrome.scripting.executeScript({ target, world: 'ISOLATED', func: installPageRelay, args: [options] })
          if (this.active !== run || !run.accepting) { this.stopFrame(run, frame); return }
          if (!relay[0]?.result || !frame.port) throw new Error('Relay unavailable')
          const injected = await chrome.scripting.executeScript({ target, world: 'MAIN', func: installPageCapture, args: [options] })
          if (this.active !== run || !run.accepting) { this.stopFrame(run, frame); return }
          const result = injected[0]?.result
          frame.installed = !!(result?.fetch || result?.xhr)
          if (!result?.fetch || !result?.xhr) partial = true
          if (!frame.installed) this.stopFrame(run, frame)
        } catch { this.stopFrame(run, frame); partial = true }
      }
      if (this.active === run && run.accepting && run.frames.get(0)?.installed) this.setStatus('listening', partial ? '正在采集响应；部分页面框架未覆盖。' : '正在采集 XHR / fetch 响应')
    } finally { run.refreshing = false }
  }
  private finishFrame(frame: Frame) {
    for (const entry of this.entries) {
      if (entry.frame !== frame) continue
      const requestPending = entry.request.body.state === 'reading'
      const responsePending = ['pending', 'reading'].includes(entry.response.state)
      if (!requestPending && !responsePending) continue
      if (requestPending) entry.request.body = { ...entry.request.body, state: 'unreadable', message: '采集已停止，请求正文尚未读完。' }
      if (responsePending) entry.response = { ...entry.response, state: 'unreadable', message: '采集已停止，此条响应正文尚未读完。' }
      const { body, headers: responseHeaders, ...summary } = entry.response
      entry.row.response = summary; entry.row.revision++
      for (const peer of this.peers) if (peer.detailId === entry.row.id) this.sendDetail(peer)
    }
    this.publish()
  }
  private receive(frame: Frame, message: Record<string, unknown>) {
    if (typeof message.requestId !== 'string' || !/^\d{1,16}$/.test(message.requestId)) return
    if (message.kind === 'request') {
      if (typeof message.url !== 'string' || message.url.length > 16384 || !/^https?:\/\//i.test(message.url)
          || typeof message.method !== 'string' || message.method.length > 32 || !['XHR', 'Fetch'].includes(String(message.type))) return
      if (this.entries.some(entry => entry.frame === frame && entry.requestId === message.requestId)) return
      const request = parseInput(message.request)
      if (!request) return
      const response = emptyResponse(), { body, headers, ...summary } = response
      this.entries.unshift({ request, row: { id: ++this.sequence, url: message.url, method: message.method, type: message.type as 'XHR' | 'Fetch', time: Date.now(), frame: frame.id === 0 ? 'page' : 'iframe', response: summary, revision: 0 }, response, frame, requestId: message.requestId })
      while (this.entries.length > CAPTURE_LIMIT) {
        const old = this.entries.pop()!
        if (old.frame.port) this.send(old.frame.port, { type: 'drop', requestId: old.requestId })
        for (const peer of this.peers) if (peer.detailId === old.row.id) this.sendDetail(peer)
      }
    } else if (message.kind === 'request-body') {
      const entry = this.entries.find(entry => entry.frame === frame && entry.requestId === message.requestId)
      const body = parseBody(message.body)
      if (!entry || entry.request.body.state !== 'reading' || !body) return
      entry.request.body = body; entry.row.revision++
      for (const peer of this.peers) if (peer.detailId === entry.row.id) this.sendDetail(peer)
    } else if (message.kind === 'response') {
      const entry = this.entries.find(entry => entry.frame === frame && entry.requestId === message.requestId)
      if (!entry || !['pending', 'reading'].includes(entry.response.state)) return
      const data = object(message.response)
      const headers = parseHeaders(data.headers)
      if (!headers) return
      if (!['reading', 'complete', 'truncated', 'unreadable', 'failed', 'timeout'].includes(String(data.state))
          || !['text', 'base64', 'none'].includes(String(data.encoding)) || typeof data.body !== 'string' || data.body.length > BODY_LIMIT * 2
          || !Number.isInteger(data.bytes) || Number(data.bytes) < 0 || Number(data.bytes) > BODY_LIMIT
          || !(data.status === null || Number.isInteger(data.status) && Number(data.status) >= 0 && Number(data.status) <= 599)) return
      for (const [key, max] of [['statusText', 128], ['contentType', 256], ['url', 16384], ['message', 512]] as const) {
        if (typeof data[key] !== 'string' || data[key].length > max) return
      }
      entry.response = { headers, state: data.state as CapturedResponse['state'], status: data.status as number | null, statusText: String(data.statusText), contentType: String(data.contentType), url: String(data.url), encoding: data.encoding as CapturedResponse['encoding'], bytes: Number(data.bytes), message: String(data.message), body: data.body }
      const { body, headers: responseHeaders, ...summary } = entry.response
      entry.row.response = summary; entry.row.revision++
      for (const peer of this.peers) if (peer.detailId === entry.row.id) this.sendDetail(peer)
    }
    if (!this.publishTimer) this.publishTimer = setTimeout(() => this.publish(), 50)
  }
}
