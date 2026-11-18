/**
 * SPS Commerce OAuth2 (client credentials) auth helpers.
 *
 * SPS Commerce uses Auth0-backed OAuth2. All public REST APIs require a
 * Bearer token obtained via the client_credentials grant from:
 *   POST https://api.spscommerce.net/authorization/v1/token
 *
 * Ref: https://spscommerce.github.io/sps-api-standards/standards/authentication.html
 */
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

interface SpsTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

/**
 * Exchange client_id + client_secret for an access token.
 * Called from SpsCommerceAdapter.exchangeCredentials and
 * SpsCommerceAdapter.exchangeCode (the latter receives code='cc' as sentinel).
 */
export async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`SPS Commerce token exchange failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as SpsTokenResponse
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { clientId, clientSecret },
  }
}

/**
 * Build the authorization URL for a standard OAuth2 authorization-code flow.
 * SPS Commerce primarily uses client_credentials (machine-to-machine), but
 * the authorization URL is included here for completeness.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = [],
): string {
  const url = new URL('https://api.spscommerce.net/authorization/v1/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  if (scopes.length > 0) url.searchParams.set('scope', scopes.join(' '))
  return url.toString()
}

/**
 * Exchange an authorization code for tokens (authorization-code flow).
 */
export async function exchangeAuthCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`SPS Commerce code exchange failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as SpsTokenResponse & { refresh_token?: string }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { clientId, clientSecret },
  }
}

/**
 * Refresh an expired access token using client credentials re-issue.
 * SPS Commerce client_credentials tokens are short-lived; re-fetch on expiry.
 */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!clientId || !clientSecret) return credentials
  return fetchClientCredentialsToken(clientId, clientSecret)
}
