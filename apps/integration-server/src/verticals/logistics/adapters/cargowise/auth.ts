import type { Credentials } from '../../adapter/interface'
import {
  CARGOWISE_OAUTH_AUTHORIZE_URL,
  CARGOWISE_OAUTH_TOKEN_URL,
  DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface CargowiseAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
}

export function buildAuthUrl(state: string, config: { clientId: string; redirectUri: string; scopes?: string[] }): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: (config.scopes ?? DEFAULT_SCOPES).join(' '),
    state,
  })
  return `${CARGOWISE_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  config: CargowiseAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...(config.redirectUri ? { redirect_uri: config.redirectUri } : {}),
  })

  const res = await fetch(CARGOWISE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CargoWise token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
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
      redirectUri: config.redirectUri,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  const redirectUri = extra.redirectUri as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('CargoWise: missing clientId/clientSecret in stored credentials')
  }

  if (!credentials.refreshToken) {
    throw new Error('CargoWise: no refreshToken available — re-authorize the connection')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  })

  const res = await fetch(CARGOWISE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CargoWise token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
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
