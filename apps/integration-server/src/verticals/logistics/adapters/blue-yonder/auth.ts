import type { Credentials } from '../../adapter/interface'
import {
  BLUE_YONDER_OAUTH_AUTHORIZE_URL,
  BLUE_YONDER_OAUTH_TOKEN_URL,
  DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface BlueYonderAuthConfig {
  clientId: string
  clientSecret: string
}

export function buildAuthUrl(state: string, redirectUri: string, scopes?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: '',
    redirect_uri: redirectUri,
    scope: scopes ?? DEFAULT_SCOPES,
    state,
  })
  return `${BLUE_YONDER_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export function buildAuthUrlWithClient(
  state: string,
  clientId: string,
  redirectUri: string,
  scopes?: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes ?? DEFAULT_SCOPES,
    state,
  })
  return `${BLUE_YONDER_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  config: BlueYonderAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetch(BLUE_YONDER_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Blue Yonder token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token?: string
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  const refreshToken = credentials.refreshToken

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh Blue Yonder credentials: missing clientId/clientSecret in extra')
  }

  if (!refreshToken) {
    throw new Error('Cannot refresh Blue Yonder credentials: missing refreshToken')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(BLUE_YONDER_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Blue Yonder token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token?: string
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
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
