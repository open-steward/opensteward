import type { Credentials } from '../../adapter/interface'
import { SKYDROPX_DASHBOARD_URL, SKYDROPX_TOKEN_URL } from './constants'

/**
 * Skydropx PRO authentication: OAuth 2.0 client credentials.
 *
 * From https://pro.skydropx.com/es-MX/api-docs.json, POST /api/v1/oauth/token:
 *   "grant_type: El tipo de concesión utilizada, como `refresh_token` o `client_credentials`."
 *   "POST /api/v1/oauth/token  Content-Type: application/x-www-form-urlencoded
 *    grant_type=client_credentials&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
 * and the response carries access_token, token_type, expires_in, scope, created_at.
 * Every other endpoint uses `bearerAuth` ("scheme": "bearer").
 *
 * There is no browser redirect: the client ID and secret come from the
 * dashboard ("Conexiones > API"), and the token is minted server-side.
 */

export function buildAuthUrl(_state: string): string {
  return SKYDROPX_DASHBOARD_URL
}

interface TokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  created_at?: number
}

export async function exchangeClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!clientId || !clientSecret) {
    throw new Error('Skydropx needs a Client ID and Client Secret (Conexiones > API).')
  }
  const res = await fetch(SKYDROPX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Skydropx token request failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as TokenResponse
  if (!json.access_token) throw new Error('Skydropx token response carried no access_token')
  return {
    accessToken: json.access_token,
    expiresAt:
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    scope: json.scope,
    extra: { clientId, clientSecret },
  }
}

/** Client-credentials tokens are re-minted from the stored client ID and secret. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra as Record<string, unknown> | undefined
  const clientId = typeof extra?.['clientId'] === 'string' ? extra['clientId'] : ''
  const clientSecret = typeof extra?.['clientSecret'] === 'string' ? extra['clientSecret'] : ''
  if (!clientId || !clientSecret) {
    throw new Error(
      'Skydropx credentials carry no client ID and secret to refresh with; reconnect with the PRO API client credentials.',
    )
  }
  return exchangeClientCredentials(clientId, clientSecret)
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
