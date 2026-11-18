import type { Credentials } from '../../adapter/interface'
import {
  TRANSPOREON_TOKEN_URL,
  TRANSPOREON_DASHBOARD_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface TransporeonAuthConfig {
  clientId: string
  clientSecret: string
  sandbox?: boolean
}

/**
 * Returns the Transporeon developer portal URL.
 * Transporeon uses OAuth2 client_credentials — there is no interactive redirect flow.
 */
export function buildAuthUrl(_state: string): string {
  return TRANSPOREON_DASHBOARD_URL
}

/**
 * Exchange client credentials for an OAuth2 access token via the
 * client_credentials grant (RFC 6749 §4.4).
 */
export async function exchangeCredentials(
  config: TransporeonAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetch(TRANSPOREON_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`transporeon token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      sandbox: config.sandbox ?? false,
    },
  }
}

/**
 * Re-exchange client credentials to obtain a fresh access token.
 * Transporeon client_credentials tokens are not refreshable via a refresh_token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error(
      'transporeon: cannot refresh credentials — clientId/clientSecret missing in extra',
    )
  }

  return exchangeCredentials({
    clientId,
    clientSecret,
    sandbox: extra.sandbox as boolean | undefined,
  })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
