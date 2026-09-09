import type { UserProfile } from '../api/asynctest/auth'
import { AUTH_STORAGE_PREFIX, type RememberedCredentials } from './contracts'

export interface StoredSession {
  id: string
  serviceUrl: string
  token: string
  user: UserProfile
}

export const sessionKey = (url: string) => AUTH_STORAGE_PREFIX + encodeURIComponent(url)

export async function readSession(url: string): Promise<StoredSession | null> {
  const key = sessionKey(url)
  const value = (await chrome.storage.local.get(key))[key] as StoredSession | undefined
  if (!value || value.serviceUrl !== url || typeof value.id !== 'string' || typeof value.token !== 'string' || !value.token
      || !value.user || !Number.isSafeInteger(value.user.id) || typeof value.user.username !== 'string'
      || typeof value.user.displayName !== 'string' || typeof value.user.avatarUrl !== 'string') return null
  return value
}

export const writeSession = (session: StoredSession) => chrome.storage.local.set({ [sessionKey(session.serviceUrl)]: session })
export const removeSession = (url: string) => chrome.storage.local.remove(sessionKey(url))

const credentialsKey = (url: string) => 'asynctest.credentials.v1:' + encodeURIComponent(url)
export async function readCredentials(url: string): Promise<RememberedCredentials> {
  const value = (await chrome.storage.local.get(credentialsKey(url)))[credentialsKey(url)] as RememberedCredentials | undefined
  if (!value || typeof value.enabled !== 'boolean') return { enabled: true, username: '', password: '' }
  return { enabled: value.enabled, username: value.enabled && typeof value.username === 'string' ? value.username : '', password: value.enabled && typeof value.password === 'string' ? value.password : '' }
}
export async function writeCredentialsPreference(url: string, enabled: boolean): Promise<RememberedCredentials> {
  const previous = await readCredentials(url)
  const credentials = enabled ? { ...previous, enabled } : { enabled, username: '', password: '' }
  await chrome.storage.local.set({ [credentialsKey(url)]: credentials })
  return credentials
}
export async function writeSuccessfulLogin(session: StoredSession, username: string, password: string, remember: boolean) {
  // Both records are committed only after the server has accepted these credentials.
  await chrome.storage.local.set({
    [sessionKey(session.serviceUrl)]: session,
    [credentialsKey(session.serviceUrl)]: { enabled: remember, username: remember ? username : '', password: remember ? password : '' },
  })
}
