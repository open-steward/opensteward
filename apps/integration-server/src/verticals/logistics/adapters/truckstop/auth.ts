import type { Credentials } from '../../adapter/interface'
import {
  TRUCKSTOP_API_BASE,
  TRUCKSTOP_TOKEN_PATH,
  TRUCKSTOP_DEFAULT_SCOPE,
  TRUCKSTOP_DASHBOARD_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface TruckstopAuthConfig {
  clientId: string
  clientSecret: string
  /** Username for Resource Owner Password grant — required for proprietary integrations. */
  username?: string
  /** Password for Resource Owner Password grant. */
  password?: string
}

/**
 * Returns the Truckstop developer portal for user-facing auth redirects.
 * Truckstop issues credentials via a signed Systems Integration Agreement rather
 * than a public OAuth authorization code flow, so we surface the portal URL.
 */
export function buildAuthUrl(_state: string): string {
  return TRUCKSTOP_DASHBOARD_URL
}

/**
 * Obtain an initial token set.
 *
 * Truckstop supports:
 *  - Resource Owner Password (username + password) — used for proprietary/direct integrations
 *  - Authorization Code — used for 3rd-party TMS; the code is exchanged below
 *
 * The token endpoint expects:
 *   - Basic auth header: base64(clientId:clientSecret)
 *   - Query param: scope=truckstop
 *   - Form body: grant_type + credentials
 */
export async function exchangeCredentials(
  config: TruckstopAuthConfig,
  /** Authorization code from OAuth callback — only required for auth-code flow. */
  code?: string,
  redirectUri?: string,
): Promise<Credentials> {
  const url = `${TRUCKSTOP_API_BASE}${TRUCKSTOP_TOKEN_PATH}?scope=${encodeURIComponent(TRUCKSTOP_DEFAULT_SCOPE)}`

  const basicCreds = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  let body: URLSearchParams
  if (code && redirectUri) {
    // Authorization code flow (3rd-party TMS integrations)
    body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    })
  } else if (config.username && config.password) {
    // Resource Owner Password flow (proprietary integrations)
    body = new URLSearchParams({
      grant_type: 'password',
      username: config.username,
      password: config.password,
    })
  } else {
    // Client credentials fallback
    body = new URLSearchParams({
      grant_type: 'client_credentials',
    })
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicCreds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Truckstop token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    token_type?: string
    expires_in?: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in != null ? new Date(Date.now() + json.expires_in * 1_000) : undefined,
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  }
}

/**
 * Exchange a refresh token for a new access/refresh token pair.
 * Truckstop refresh tokens are single-use and expire after 6 months.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) {
    throw new Error('Truckstop: no refresh token available — re-authenticate')
  }

  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Truckstop: missing clientId/clientSecret in credentials extra — re-authenticate')
  }

  const url = `${TRUCKSTOP_API_BASE}${TRUCKSTOP_TOKEN_PATH}?scope=${encodeURIComponent(TRUCKSTOP_DEFAULT_SCOPE)}`
  const basicCreds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicCreds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Truckstop token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    token_type?: string
    expires_in?: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in != null ? new Date(Date.now() + json.expires_in * 1_000) : undefined,
    scope: json.scope ?? credentials.scope,
    extra: { clientId, clientSecret },
  }
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
