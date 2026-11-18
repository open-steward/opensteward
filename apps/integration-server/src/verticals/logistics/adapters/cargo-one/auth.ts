/**
 * cargo.one authentication — OAuth 2.0 client_credentials flow.
 *
 * getAuthUrl:         Returns the cargo.one developer portal (no browser redirect flow).
 * exchangeCode:       Accepts "clientId|clientSecret" (pipe-separated) or treats the
 *                     code as the access token for direct integration setups.
 * refreshCredentials: Re-runs the client_credentials grant using clientId/clientSecret
 *                     stored in credentials.extra.
 */
import type { Credentials } from '../../adapter/interface'
import { CARGO_ONE_TOKEN_URL, CARGO_ONE_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return CARGO_ONE_DASHBOARD_URL
}

export async function exchangeClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(CARGO_ONE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`cargo.one token request failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    scope: json.scope,
    extra: { clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra as Record<string, string> | undefined
  const clientId = extra?.['clientId'] ?? ''
  const clientSecret = extra?.['clientSecret'] ?? ''
  if (!clientId || !clientSecret) {
    // Cannot refresh without stored client credentials — return as-is.
    return credentials
  }
  return exchangeClientCredentials(clientId, clientSecret)
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
