/**
 * Spiro OAuth 2.0 helpers.
 *
 * Spiro uses a standard authorization-code flow.  All tokens are obtained from
 * and refreshed at https://engine.spiro.ai/oauth/token.
 *
 * Note: Spiro implements refresh-token rotation — every access-token refresh
 * issues a new refresh token and invalidates the old one.  The caller must
 * persist the updated refresh token after every call to refreshToken().
 */
import type { Credentials } from '@opensteward/shared'
import {
  SPIRO_AUTH_URL,
  SPIRO_TOKEN_URL,
  DEFAULT_SPIRO_SCOPES,
} from './constants'

export interface SpiroOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** OAuth scopes to request. Defaults to DEFAULT_SPIRO_SCOPES when omitted. */
  scopes?: string[]
}

export function buildAuthUrl(config: SpiroOAuthConfig, state: string): string {
  const url = new URL(SPIRO_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_SPIRO_SCOPES).join(' '))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  config: SpiroOAuthConfig,
  code: string,
): Promise<Credentials> {
  const res = await fetch(SPIRO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Spiro token exchange failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}

export async function refreshToken(
  config: Pick<SpiroOAuthConfig, 'clientId' | 'clientSecret'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const res = await fetch(SPIRO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Spiro token refresh failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  // Spiro rotates refresh tokens — always persist the new one.
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
