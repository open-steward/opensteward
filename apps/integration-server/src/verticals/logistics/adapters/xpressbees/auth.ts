import type { Credentials } from '../../adapter/interface'
import { XPRESSBEES_LOGIN_URL } from './constants'

/**
 * The login response names no expiry, but its `data` is a JWT (the documented
 * sample is one, with standard `iat`/`exp` claims three hours apart). Its `exp`
 * becomes `expiresAt`, so the shared TokenRefresher logs in again before the
 * token lapses and the new token is stored. A token that is not a decodable
 * JWT with a numeric `exp` gets no `expiresAt`; the client's 401 re-login
 * covers it.
 */
function jwtExpiry(token: string): Date | undefined {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[1]) return undefined
  try {
    const { exp } = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      exp?: unknown
    }
    return typeof exp === 'number' && Number.isFinite(exp) ? new Date(exp * 1000) : undefined
  } catch {
    return undefined
  }
}

interface XpressbeesLoginResponse {
  status?: boolean
  data?: unknown
  message?: string
}

/**
 * "Generate Token" (https://documenter.getpostman.com/view/15188467/2s9YyzcxWT):
 * POST https://shipment.xpressbees.com/api/users/login with the raw JSON body
 * `{ "email" : "demo@xpressbees.com", "password" : "demo@123" }`. It answers
 * `{ "status": true, "data": "<JWT>" }`, or 401
 * `{ "status": false, "message": "Invalid email or password" }`.
 *
 * Every other request sends the token as `Bearer <token>`. The token lapses
 * (the documented sample's JWT expires three hours after it was issued), so
 * the email and password stay on `extra` for the client to log in again.
 */
export async function requestToken(
  email: string,
  password: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const res = await fetchImpl(XPRESSBEES_LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = (await res.json().catch(() => ({}))) as XpressbeesLoginResponse
  if (!res.ok || json.status !== true || typeof json.data !== 'string' || !json.data) {
    throw new Error(`Xpressbees login failed: ${json.message ?? `HTTP ${res.status}`}`)
  }
  const expiresAt = jwtExpiry(json.data)
  return {
    accessToken: json.data,
    ...(expiresAt ? { expiresAt } : {}),
    extra: { email, password },
  }
}

/** The email and password `requestToken` stored on `extra`, if this connection has them. */
export function storedLogin(credentials: Credentials): { email: string; password: string } | null {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const email = extra['email']
  const password = extra['password']
  if (typeof email !== 'string' || typeof password !== 'string') return null
  return { email, password }
}

/**
 * Logs in again from the stored pair. A connection made before the pair was
 * stored (the old static-key form) has nothing to log in with and comes back
 * unchanged: it must reconnect.
 */
export async function refreshCredentials(
  credentials: Credentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const login = storedLogin(credentials)
  if (!login) return credentials
  return requestToken(login.email, login.password, fetchImpl)
}
