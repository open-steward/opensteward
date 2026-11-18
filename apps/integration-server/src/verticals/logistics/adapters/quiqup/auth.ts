import type { Credentials } from '../../adapter/interface'
import {
  QUIQUP_AUTH_BASE,
  QUIQUP_TOKEN_PATH,
  QUIQUP_DASHBOARD_URL,
  QUIQUP_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

/**
 * Quiqup uses OAuth2 client_credentials grant.
 *
 * Partners obtain a clientId and clientSecret from the Quiqup partner portal.
 * There is no user-facing authorization redirect — the Connect Link form
 * collects clientId + clientSecret and immediately exchanges them for an
 * access token via the token endpoint.
 *
 * Token endpoint: POST https://auth.quiqup.com/oauth/token
 * Tokens expire (typically 3600 s); we refresh proactively via refreshCredentials.
 */

export interface QuiqupAuthConfig {
  clientId: string
  clientSecret: string
}

interface QuiqupTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

/**
 * Build the auth URL. Quiqup uses client_credentials (no redirect),
 * so we send users to the partner portal to retrieve their credentials.
 */
export function buildAuthUrl(_state: string): string {
  return QUIQUP_DASHBOARD_URL
}

/**
 * Exchange clientId + clientSecret for an access token via client_credentials.
 */
export async function exchangeClientCredentials(
  config: QuiqupAuthConfig,
): Promise<Credentials> {
  const url = `${QUIQUP_AUTH_BASE}${QUIQUP_TOKEN_PATH}`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: QUIQUP_SCOPES.join(' '),
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Quiqup token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as QuiqupTokenResponse

  return {
    accessToken: json.access_token,
    expiresAt:
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  }
}

/**
 * Refresh an expired Quiqup access token using stored client credentials.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra['clientId'] as string | undefined
  const clientSecret = extra['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error(
      'Cannot refresh Quiqup credentials: missing clientId/clientSecret in extra',
    )
  }

  return exchangeClientCredentials({ clientId, clientSecret })
}

/**
 * Returns true if the token should be refreshed (expired or expiring soon).
 */
export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

/**
 * Build the Authorization header value for Quiqup requests.
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
