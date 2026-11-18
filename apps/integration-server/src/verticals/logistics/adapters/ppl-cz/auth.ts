import type { Credentials } from '../../adapter/interface'
import { PPL_CZ_TOKEN_URL, TOKEN_TTL_MS, TOKEN_REFRESH_BUFFER_MS } from './constants'

/**
 * PPL CZ CPL API uses OAuth2 client_credentials grant.
 *
 * Credentials exchange:
 *   POST /login/getAccessToken
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&client_id=...&client_secret=...&scope=myapi2
 *
 * The access token is a JWT valid for 30 minutes. Tokens should be reused
 * throughout their validity period (max 12 refresh requests/minute enforced
 * by the gateway).
 *
 * We store clientId + clientSecret in credentials.extra so that
 * refreshCredentials can re-issue a token without prompting the user again.
 */

interface PplTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
  scope?: string
}

/**
 * Exchange client credentials for an access token.
 */
export async function exchangeClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'myapi2',
  })

  const res = await fetch(PPL_CZ_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PPL CZ token endpoint returned ${res.status}: ${text}`)
  }

  const json = (await res.json()) as PplTokenResponse
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in * 1000 : TOKEN_TTL_MS
  const expiresAt = new Date(Date.now() + expiresIn)

  return {
    accessToken: json.access_token,
    expiresAt,
    scope: json.scope,
    extra: { clientId, clientSecret },
  }
}

/**
 * Refresh expired credentials using stored client credentials.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra as Record<string, string> | undefined
  const clientId = extra?.['clientId'] ?? ''
  const clientSecret = extra?.['clientSecret'] ?? ''

  if (!clientId || !clientSecret) {
    // Cannot refresh without client credentials — return as-is and let the
    // request fail naturally (caller should surface a re-auth prompt).
    return credentials
  }

  return exchangeClientCredentials(clientId, clientSecret)
}

/**
 * Returns true when the token is still valid with the refresh buffer applied.
 */
export function isTokenValid(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return true // no expiry info → assume valid
  return credentials.expiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS > Date.now()
}

/**
 * Build the Authorization header value.
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
