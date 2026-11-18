import type { Credentials } from '../../adapter/interface'
import { GEODIS_DASHBOARD_URL, GEODIS_TOKEN_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

/**
 * GEODIS authentication, from the first-party Postman collection
 * (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw?segregateAuth=true&versionTag=latest).
 *
 * "Authentication API — Call this API to get a new token or to get a refresh
 * token." GenerateToken is `POST https://auth.ams.geodis.com/realms/sso/protocol/openid-connect/token`
 * with `"auth": {"type": "basic", ... "username" ..., "password" ...}` and the
 * urlencoded body `grant_type=client_credentials`; it answers
 * `{"access_token": ..., "expires_in": 300, ..., "token_type": "bearer"}`.
 * Every WMS call then sends `Authorization: Bearer <Generated Token>`.
 *
 * The token lives five minutes, so the username and password are kept on
 * `credentials.extra` and a new token is minted whenever the current one is
 * about to expire. The WMS calls also need the "Customer ID Provided By
 * Geodis", which is kept there too.
 */

export interface GeodisCredentialExtra {
  username: string
  password: string
  customerId: string
}

interface GeodisTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

export function buildAuthUrl(_state: string): string {
  return GEODIS_DASHBOARD_URL
}

/** GenerateToken: a client-credentials grant, authenticated with HTTP basic auth. */
export async function generateToken(
  extra: GeodisCredentialExtra,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const basic = Buffer.from(`${extra.username}:${extra.password}`).toString('base64')
  const res = await fetchImpl(GEODIS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GEODIS token endpoint returned ${res.status}: ${text}`)
  }
  const json = (await res.json()) as GeodisTokenResponse
  if (!json.access_token) throw new Error('GEODIS token endpoint returned no access_token')
  return {
    accessToken: json.access_token,
    expiresAt:
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    extra: { ...extra },
  }
}

/** The username, password and customer id a connection was made with, if it has them. */
export function credentialExtra(credentials: Credentials): Partial<GeodisCredentialExtra> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v !== '' ? v : undefined
  return {
    username: str(extra['username']),
    password: str(extra['password']),
    customerId: str(extra['customerId']),
  }
}

/** A new token from the stored username and password; the credentials as they are without them. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const { username, password, customerId } = credentialExtra(credentials)
  if (!username || !password || !customerId) return credentials
  return generateToken({ username, password, customerId })
}

/** The credentials, with a new token when the current one expires within the buffer. */
export async function ensureFreshToken(credentials: Credentials): Promise<Credentials> {
  const expiresAt = credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : undefined
  if (expiresAt === undefined || expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now())
    return credentials
  return refreshCredentials(credentials)
}
