import { BODY_LIMIT, type CapturedInput, type CapturedBody, type CapturedHeaders } from './contracts'

// Boundary validation for untrusted MAIN-world data; never interpret it as an API command.
export function parseHeaders(value: unknown): CapturedHeaders | null {
  if (!value || typeof value !== 'object') return null
  const data = value as CapturedHeaders
  if (!['page-visible', 'truncated', 'unreadable'].includes(data.state) || typeof data.message !== 'string' || data.message.length > 512
      || !Array.isArray(data.entries) || data.entries.length > 256) return null
  let size = 0
  const entries: [string, string][] = []
  for (const pair of data.entries) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null
    size += pair[0].length + pair[1].length
    if (size > 65536) return null
    entries.push([pair[0], pair[1]])
  }
  return { entries, state: data.state, message: data.message }
}
export function parseBody(value: unknown): CapturedBody | null {
  if (!value || typeof value !== 'object') return null
  const data = value as CapturedBody
  if (!['none', 'reading', 'complete', 'truncated', 'unreadable', 'timeout'].includes(data.state)
      || !['none', 'text', 'base64'].includes(data.encoding) || typeof data.body !== 'string' || data.body.length > BODY_LIMIT * 2
      || !Number.isInteger(data.bytes) || data.bytes < 0 || data.bytes > BODY_LIMIT
      || typeof data.contentType !== 'string' || data.contentType.length > 256 || typeof data.message !== 'string' || data.message.length > 512) return null
  return { state: data.state, encoding: data.encoding, body: data.body, bytes: data.bytes, contentType: data.contentType, message: data.message }
}
export function parseInput(value: unknown): CapturedInput | null {
  if (!value || typeof value !== 'object') return null
  const data = value as CapturedInput
  const headers = parseHeaders(data.headers), body = parseBody(data.body)
  if (!headers || !body || typeof data.url !== 'string' || data.url.length > BODY_LIMIT || !/^https?:\/\//i.test(data.url) || typeof data.urlTruncated !== 'boolean') return null
  return { url: data.url, urlTruncated: data.urlTruncated, headers, body }
}
