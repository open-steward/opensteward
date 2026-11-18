import type { Credentials } from '../../adapter/interface'
import {
  DAT_OAUTH_AUTHORIZE_URL,
  DAT_OAUTH_TOKEN_URL,
  DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface DatAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

export function buildAuthUrl(state: string, config: Pick<DatAuthConfig, 'clientId' | 'redirectUri'> & { scopes?: string[] }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: (config.scopes ?? DEFAULT_SCOPES).join(' '),
    state,
  })
  if (config.redirectUri) {
    params.set('redirect_uri', config.redirectUri)
  }
  return `${DAT_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  config: DatAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })
  if (config.redirectUri) {
    body.set('redirect_uri', config.redirectUri)
  }

  const res = await fetch(DAT_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DAT token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
    token_type: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
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
  const refreshToken = credentials.refreshToken

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh DAT credentials: missing clientId/clientSecret in extra')
  }
  if (!refreshToken) {
    throw new Error('Cannot refresh DAT credentials: no refresh token available')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(DAT_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DAT token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
    token_type: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: {
      clientId,
      clientSecret,
      redirectUri: extra.redirectUri,
    },
  }
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
