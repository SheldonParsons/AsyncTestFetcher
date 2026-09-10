import type { PageCaptureOptions } from './contracts'

// Runs in ISOLATED. Page messages are untrusted capture data, never privileged commands.
export function installPageRelay(options: PageCaptureOptions): Promise<boolean> {
  const host = window as unknown as Record<string, unknown>
  const slot = '__asynctest_capture_relay_v2__'
  try { (host[slot] as { stop?: () => void })?.stop?.() } catch {}
  return new Promise(resolve => {
    let port: chrome.runtime.Port
    let stopped = false, ready = false, settled = false
    let heartbeat = 0, timeout = 0
    const post = (type: string, extra: object = {}) => window.postMessage({ direction: 'fetcher-control-v2', nonce: options.nonce, type, ...extra }, '*')
    const settle = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
    const stop = () => {
      if (stopped) return
      stopped = true
      clearInterval(heartbeat); clearTimeout(timeout)
      post('stop')
      window.removeEventListener('message', receive)
      window.removeEventListener('pagehide', stop)
      document.removeEventListener('visibilitychange', visibility)
      try { port?.disconnect() } catch {}
      if (host[slot] === controller) delete host[slot]
      settle(false)
    }
    const current = () => location.href === options.url && document.visibilityState !== 'hidden'
    const visibility = () => { if (!current()) stop() }
    const headers = (value: any) => {
      if (!value || !['page-visible', 'truncated', 'unreadable'].includes(value.state) || typeof value.message !== 'string' || value.message.length > 512 || !Array.isArray(value.entries) || value.entries.length > 256) return null
      let size = 0
      const entries: [string, string][] = []
      for (const pair of value.entries) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null
        size += pair[0].length + pair[1].length
        if (size > 65536) return null
        entries.push([pair[0], pair[1]])
      }
      return { entries, state: value.state, message: value.message }
    }
    const body = (value: any) => {
      if (!value || !['none', 'reading', 'complete', 'truncated', 'unreadable', 'timeout'].includes(value.state)
          || !['text', 'base64', 'none'].includes(value.encoding) || typeof value.body !== 'string' || value.body.length > options.maxBytes * 2
          || !Number.isInteger(value.bytes) || value.bytes < 0 || value.bytes > options.maxBytes
          || typeof value.contentType !== 'string' || value.contentType.length > 256 || typeof value.message !== 'string' || value.message.length > 512) return null
      return { state: value.state, encoding: value.encoding, body: value.body, bytes: value.bytes, contentType: value.contentType, message: value.message }
    }
    const receive = (event: MessageEvent) => {
      if (stopped || !ready || event.source !== window || event.data?.direction !== 'fetcher-data-v2' || event.data?.nonce !== options.nonce) return
      if (!current()) { stop(); return }
      const data = event.data.payload
      if (!data || typeof data !== 'object' || typeof data.requestId !== 'string' || !/^\d{1,16}$/.test(data.requestId)) return
      let payload: object
      if (data.kind === 'request') {
        if (typeof data.url !== 'string' || data.url.length > 16384 || typeof data.method !== 'string' || data.method.length > 32 || !['XHR', 'Fetch'].includes(data.type)) return
        const request = data.request, requestHeaders = headers(request?.headers), requestBody = body(request?.body)
        if (!requestHeaders || !requestBody || typeof request.url !== 'string' || request.url.length > options.maxBytes || typeof request.urlTruncated !== 'boolean') return
        payload = { kind: data.kind, requestId: data.requestId, url: data.url, method: data.method, type: data.type,
          request: { url: request.url, urlTruncated: request.urlTruncated, headers: requestHeaders, body: requestBody } }
      } else if (data.kind === 'request-body') {
        const requestBody = body(data.body)
        if (!requestBody) return
        payload = { kind: data.kind, requestId: data.requestId, body: requestBody }
      } else if (data.kind === 'response') {
        const response = data.response, responseHeaders = headers(response?.headers)
        if (!response || !responseHeaders || !['reading', 'complete', 'truncated', 'unreadable', 'failed', 'timeout'].includes(response.state)
            || !['text', 'base64', 'none'].includes(response.encoding)
            || !(response.status === null || Number.isInteger(response.status) && response.status >= 0 && response.status <= 599)
            || !Number.isInteger(response.bytes) || response.bytes < 0 || response.bytes > options.maxBytes
            || typeof response.body !== 'string' || response.body.length > options.maxBytes * 2
            || typeof response.message !== 'string' || response.message.length > 512
            || typeof response.url !== 'string' || response.url.length > 16384
            || typeof response.contentType !== 'string' || response.contentType.length > 256
            || typeof response.statusText !== 'string' || response.statusText.length > 128) return
        payload = { kind: data.kind, requestId: data.requestId, response: {
          state: response.state, status: response.status, statusText: response.statusText, contentType: response.contentType,
          url: response.url, encoding: response.encoding, bytes: response.bytes, message: response.message, body: response.body, headers: responseHeaders,
        } }
      } else return
      try { port.postMessage({ type: 'event', nonce: options.nonce, data: payload }) } catch { stop() }
    }
    const controller = { stop, nonce: options.nonce }
    host[slot] = controller
    try {
      if (!current()) { stop(); return }
      port = chrome.runtime.connect({ name: options.relayPort })
      port.onDisconnect.addListener(() => { void chrome.runtime.lastError; stop() })
      port.onMessage.addListener(message => {
        if (message?.type === 'ready') { ready = true; clearTimeout(timeout); settle(true) }
        else if (message?.type === 'stop') stop()
        else if (message?.type === 'drop' && typeof message.requestId === 'string') post('drop', { requestId: message.requestId })
      })
      window.addEventListener('message', receive)
      window.addEventListener('pagehide', stop)
      document.addEventListener('visibilitychange', visibility)
      timeout = window.setTimeout(stop, 5000)
      heartbeat = window.setInterval(() => {
        if (!current()) { stop(); return }
        try { port.postMessage({ type: 'heartbeat', nonce: options.nonce }); post('renew') } catch { stop() }
      }, 5000)
      port.postMessage({ type: 'hello', nonce: options.nonce })
    } catch { stop() }
  })
}

export function stopPageRelay(nonce: string) {
  const controller = (window as unknown as Record<string, unknown>).__asynctest_capture_relay_v2__ as { nonce?: string; stop?: () => void } | undefined
  if (controller?.nonce === nonce) controller.stop?.()
}
