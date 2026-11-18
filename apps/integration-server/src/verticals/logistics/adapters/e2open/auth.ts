import type { Credentials } from '../../adapter/interface'
import {
  E2OPEN_OAUTH_AUTHORIZE_URL,
  E2OPEN_OAUTH_TOKEN_URL,
  DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface E2openAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
}

/**
 * Build the OAuth2 authorization URL for the standard auth code flow.
 */
export function buildAuthUrl(
  state: string,
  config: Pick<E2openAuthConfig, 'clientId' | 'redirectUri' | 'scopes'>,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    state,
    scope: (config.scopes ?? DEFAULT_SCOPES).join(' '),
  })
  if (config.redirectUri) {
    params.set('redirect_uri', config.redirectUri)
  }
  return `${E2OPEN_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Exchange an OAuth2 authorization code for an access token + refresh token.
 */
export async function exchangeCode(
  code: string,
  config: E2openAuthConfig,
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

  const res = await fetch(E2OPEN_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`E2open token exchange failed (${res.status}): ${text}`)
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

/**
 * Use the stored refresh token to obtain a new access token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  const redirectUri = extra.redirectUri as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('E2open: cannot refresh — missing clientId/clientSecret in credentials.extra')
  }
  if (!credentials.refreshToken) {
    throw new Error('E2open: cannot refresh — no refresh_token stored in credentials')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  if (redirectUri) {
    body.set('redirect_uri', redirectUri)
  }

  const res = await fetch(E2OPEN_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`E2open token refresh failed (${res.status}): ${text}`)
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
    scope: json.scope ?? credentials.scope,
    extra: {
      clientId,
      clientSecret,
      redirectUri,
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
