import type { Credentials } from '../../adapter/interface'
import {
  CHR_API_BASE,
  CHR_TOKEN_URL,
  CHR_DASHBOARD_URL,
  CHR_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface CHRobinsonAuthConfig {
  clientId: string
  clientSecret: string
}

/**
 * Returns the developer dashboard URL as the auth entry-point.
 * C.H. Robinson uses client_credentials flow — there is no interactive
 * OAuth2 redirect; the dashboard is the place to obtain credentials.
 */
export function buildAuthUrl(_state: string): string {
  return CHR_DASHBOARD_URL
}

/**
 * Obtain an access token via OAuth 2.0 client_credentials grant.
 * C.H. Robinson uses a Duende IdentityServer instance at
 * https://api.chrobinson.com/identity.
 */
export async function exchangeCredentials(
  config: CHRobinsonAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: CHR_SCOPES,
  })

  const res = await fetch(CHR_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`ch-robinson: token exchange failed (${res.status}): ${text}`)
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
      baseUrl: CHR_API_BASE,
    },
  }
}

/**
 * Re-obtain a fresh access token using the client credentials stored in
 * `credentials.extra`.  client_credentials tokens are not refreshable via
 * refresh_token — we simply issue a new token request.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error(
      'ch-robinson: cannot refresh — missing clientId/clientSecret in credentials.extra',
    )
  }

  return exchangeCredentials({ clientId, clientSecret })
}

/** Returns true when the token is within the refresh buffer window. */
export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

/** Builds the Authorization header value. */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
