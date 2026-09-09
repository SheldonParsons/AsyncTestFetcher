import type { UserProfile } from '../api/asynctest/auth'
import type { ServiceConfig } from '../settings/service'

export const AUTH_STORAGE_PREFIX = 'asynctest.auth.v1:'
export interface AuthState {
  service: ServiceConfig | null
  status: 'anonymous' | 'authenticated' | 'unverified'
  sessionId: string | null
  user: UserProfile | null
  message?: string
  reason?: 'expired' | 'permission' | 'unavailable'
}

export type AuthCommand =
  | { type: 'auth.state'; force?: boolean }
  | { type: 'auth.login'; serviceUrl: string; username: string; password: string; remember: boolean }
  | { type: 'auth.logout'; serviceUrl: string; sessionId: string }
  | { type: 'service.save'; service: ServiceConfig }

export type AuthReply = { ok: true; state: AuthState } | { ok: false; error: { kind: string; message: string } }

export interface RememberedCredentials { enabled: boolean; username: string; password: string }
export type CredentialsCommand = { type: 'credentials.get'; serviceUrl: string } | { type: 'credentials.preference'; serviceUrl: string; enabled: boolean }
export type CredentialsReply = { ok: true; credentials: RememberedCredentials } | { ok: false; error: { kind: string; message: string } }

// Chrome 主机权限按协议和主机授予；端口、部署路径仍由 API client 精确约束。
export function serviceOriginPattern(serviceUrl: string): string {
  const url = new URL(serviceUrl)
  return `${url.protocol}//${url.hostname}/*`
}
