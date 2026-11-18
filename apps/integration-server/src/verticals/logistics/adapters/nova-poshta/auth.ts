import type { Credentials } from '../../adapter/interface'
import { NOVA_POSHTA_API_BASE, NOVA_POSHTA_DASHBOARD_URL } from './constants'

/**
 * Nova Poshta uses an API key that must be exchanged for a short-lived JWT
 * via GET /clients/authorization?apiKey={apiKey}.
 * The JWT (~1 hour TTL) is then passed in every request as:
 *   Authorization: <jwt>
 *
 * We store the raw API key as `refreshToken` so we can re-exchange on expiry,
 * and the active JWT as `accessToken`.
 */

export function buildAuthUrl(_state: string): string {
  // No OAuth flow — direct users to the API portal.
  return NOVA_POSHTA_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  const jwt = await fetchJwt(apiKey)
  return {
    accessToken: jwt,
    refreshToken: apiKey,
    // Expire slightly early so we refresh before the server rejects.
    expiresAt: new Date(Date.now() + 50 * 60 * 1000), // 50 minutes
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const apiKey = credentials.refreshToken
  if (!apiKey) {
    // If we only have an accessToken (legacy), treat it as the API key.
    return exchangeApiKey(credentials.accessToken)
  }
  return exchangeApiKey(apiKey)
}

async function fetchJwt(apiKey: string): Promise<string> {
  const url = `${NOVA_POSHTA_API_BASE}clients/authorization?apiKey=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Nova Poshta auth failed: ${res.status} ${res.statusText}`)
  }
  // 200 "JWT-token": { jwt } — https://api-portal.novapost.com/methods/methods/authorization.md
  const body = (await res.json()) as { jwt?: string }
  if (!body.jwt) {
    throw new Error('Nova Poshta auth response did not contain a jwt')
  }
  return body.jwt
}
