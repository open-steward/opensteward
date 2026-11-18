import type { Credentials } from '../../adapter/interface'
import { FEDEX_API_BASE, FEDEX_SANDBOX_API_BASE, FEDEX_TOKEN_PATH, FEDEX_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface FedExAuthConfig {
  clientId: string
  clientSecret: string
  sandbox?: boolean
}

function baseUrl(sandbox?: boolean): string {
  return sandbox ? FEDEX_SANDBOX_API_BASE : FEDEX_API_BASE
}

/**
 * FedEx uses OAuth2 client_credentials — there is no redirect-based auth flow.
 * Returns the FedEx developer dashboard URL.
 */
export function buildAuthUrl(_state: string): string {
  return FEDEX_DASHBOARD_URL
}

/**
 * Exchange client credentials for an access token.
 * The "code" parameter is ignored for client_credentials; we use clientId/clientSecret
 * from the config instead.
 */
export async function exchangeCredentials(config: FedExAuthConfig): Promise<Credentials> {
  const url = `${baseUrl(config.sandbox)}${FEDEX_TOKEN_PATH}`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FedEx token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in: number
    scope: string
  }

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      sandbox: config.sandbox,
    },
  }
}

/**
 * Refresh credentials by re-exchanging client_credentials.
 * FedEx does not issue refresh tokens — a new token request is required.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh FedEx credentials: missing clientId/clientSecret in extra')
  }

  return exchangeCredentials({
    clientId,
    clientSecret,
    sandbox: extra.sandbox as boolean | undefined,
  })
}

/**
 * Returns true when the token is expired or about to expire.
 */
export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

/**
 * Build the Authorization header value.
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
