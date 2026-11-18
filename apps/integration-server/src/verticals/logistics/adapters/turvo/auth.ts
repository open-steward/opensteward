import type { Credentials } from '../../adapter/interface'
import { TURVO_OAUTH_AUTHORIZE_URL, TURVO_OAUTH_TOKEN_URL, DEFAULT_SCOPES, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface TurvoAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export function buildAuthUrl(config: TurvoAuthConfig, state: string): string {
  const url = new URL(TURVO_OAUTH_AUTHORIZE_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_SCOPES).join(' '))
  url.searchParams.set('state', state)
  return url.toString()
}

interface TurvoTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  config: TurvoAuthConfig,
): Promise<Credentials> {
  const res = await fetch(TURVO_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Turvo token exchange failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as TurvoTokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  const redirectUri = extra.redirectUri as string | undefined

  if (!credentials.refreshToken || !clientId || !clientSecret) {
    throw new Error('Cannot refresh Turvo credentials: missing refreshToken or client credentials')
  }

  const res = await fetch(TURVO_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Turvo token refresh failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as TurvoTokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    scope: json.scope ?? credentials.scope,
    extra: credentials.extra,
  }
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
