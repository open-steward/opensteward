/**
 * Deposco authentication helpers.
 *
 * First-party reference (tag "Authentication and authorization" of the spec at
 * https://auth.deposco.com/public/spec?version=latest):
 *
 *   "Once your application is approved by Deposco, it can be installed in a
 *    Deposco customer environment. A user with an account in the environment
 *    must open the installation link, log in, and grant access to the
 *    application. A refresh token is then generated for the application in
 *    that environment."
 *
 *   "Use the refresh token with the client ID and secret for the application
 *    to request an access token. For example:
 *        curl --location 'https://auth.deposco.com/oauth2/token' \
 *        --header 'Content-Type: application/x-www-form-urlencoded' \
 *        --data-urlencode 'grant_type=refresh_token' \
 *        --data-urlencode 'refresh_token=…' \
 *        --data-urlencode 'client_id=…' \
 *        --data-urlencode 'client_secret=…'"
 *
 *   "The access token that is returned is valid for one hour. When it expires,
 *    use the refresh token to request a new access token. Refresh tokens are
 *    valid until the application is updated in the developer portal."
 *
 *   "Provide the access token as a bearer token in the 'Authorization' header
 *    of each request."
 *
 * The developer portal shows each installation's refresh token behind a "Copy
 * Refresh Token" button, which is where the connecting user finds it. The old
 * client_credentials grant and the tenant code are not in the documentation.
 */
import type { Credentials } from '../../adapter/interface'
import {
  DEPOSCO_ACCESS_TOKEN_TTL_SECONDS,
  DEPOSCO_DASHBOARD_URL,
  DEPOSCO_TOKEN_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface DeposcoAuthConfig {
  clientId: string
  clientSecret: string
  /** The refresh token of the application's installation in the customer environment. */
  refreshToken: string
}

export function buildAuthUrl(_state: string): string {
  return DEPOSCO_DASHBOARD_URL
}

/** Trade the installation's refresh token for a one-hour access token. */
export async function exchangeCredentials(config: DeposcoAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetch(DEPOSCO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deposco token request failed (${res.status}): ${text}`)
  }

  // RFC 6749 §5.1 access token response (the spec declares an `oauth2` scheme
  // with this token URL).
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error('Deposco token response carried no access_token')

  const ttl =
    typeof json.expires_in === 'number' ? json.expires_in : DEPOSCO_ACCESS_TOKEN_TTL_SECONDS

  return {
    accessToken: json.access_token,
    refreshToken: config.refreshToken,
    expiresAt: new Date(Date.now() + ttl * 1000),
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId
  const clientSecret = extra.clientSecret
  const refreshToken = credentials.refreshToken

  if (typeof clientId !== 'string' || typeof clientSecret !== 'string' || !refreshToken) {
    throw new Error(
      'Cannot refresh Deposco credentials: the connection has no client ID, client secret and refresh token. Reconnect it with the refresh token from the Deposco developer portal.',
    )
  }

  return exchangeCredentials({ clientId, clientSecret, refreshToken })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return new Date(credentials.expiresAt).getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
