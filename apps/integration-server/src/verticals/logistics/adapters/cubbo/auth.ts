import type { CredentialField, Credentials } from '@opensteward/shared'
import { CUBBO_TOKEN_URL } from './constants'

/**
 * Cubbo issues a Bearer token from its own token endpoint (developers.cubbo.com,
 * "Auth - Get token"):
 *
 *   POST https://api.cubbo.com/v1/auth/token
 *   { "client_id": "...", "client_secret": "..." }            (raw JSON body)
 *   → { "token": "...", "expires_in": 86400, "type": "Bearer" }
 *
 * "Send it on every request as Authorization: Bearer <token>." and
 * "There are no refresh tokens. When a token expires (after expires_in
 * seconds) request a new one by calling this endpoint again with your
 * client_id / client_secret." So the id and secret are kept on
 * `credentials.extra` and a refresh re-runs the exchange.
 *
 * This is not the generic `oauth2ClientCredentials` form helper: that one
 * posts form-encoded and reads `access_token`, and Cubbo documents a JSON body
 * and a `token` field.
 */

const FIELDS: CredentialField[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', required: true },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
]

interface CubboTokenResponse {
  token?: unknown
  expires_in?: unknown
  type?: unknown
}

export function credentialFields(): CredentialField[] {
  return FIELDS
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = (fields?.['clientId'] ?? '').trim()
  const clientSecret = fields?.['clientSecret'] ?? ''
  if (!clientId || !clientSecret) {
    throw new Error('Client ID and client secret are required.')
  }
  const res = await globalThis.fetch(CUBBO_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Cubbo token endpoint returned ${res.status}: ${text}`)
  }
  const json = (await res.json()) as CubboTokenResponse
  if (typeof json.token !== 'string' || json.token === '') {
    throw new Error('Cubbo token endpoint returned no token')
  }
  return {
    accessToken: json.token,
    expiresAt:
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    extra: { clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = String(credentials.extra?.['clientId'] ?? '')
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
  if (!clientId || !clientSecret) {
    // Cannot refresh — return existing credentials and let the next call fail.
    return credentials
  }
  return exchangeCredentials({ clientId, clientSecret })
}
