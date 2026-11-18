import type { Credentials } from '../../adapter/interface'
import { UPS_API_BASE, UPS_TOKEN_ENDPOINT, UPS_DASHBOARD_URL } from './constants'

/**
 * UPS uses OAuth2 client_credentials flow.
 *
 * getAuthUrl:          Returns the UPS developer portal (no redirect-based flow).
 * exchangeCode:        Treats "code" as "clientId:clientSecret", calls the token endpoint.
 * refreshCredentials:  Re-fetches a new token using the stored client credentials.
 */

export function buildAuthUrl(_state: string): string {
  return UPS_DASHBOARD_URL
}

export async function exchangeClientCredentials(
  clientId: string,
  clientSecret: string,
  baseUrl: string = UPS_API_BASE,
): Promise<Credentials> {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${baseUrl}${UPS_TOKEN_ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`UPS OAuth token request failed (${res.status}): ${text}`)
  }

  const body = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in: number
  }

  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    extra: { clientId, clientSecret, baseUrl },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra as Record<string, string> | undefined
  if (!extra?.clientId || !extra?.clientSecret) {
    throw new Error('Cannot refresh UPS credentials: missing clientId/clientSecret in extra')
  }
  return exchangeClientCredentials(extra.clientId, extra.clientSecret, extra.baseUrl ?? UPS_API_BASE)
}
