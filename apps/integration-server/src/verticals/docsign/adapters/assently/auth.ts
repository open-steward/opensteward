/**
 * Assently auth helpers.
 *
 * Assently authenticates with OAuth 2.0 Client-Credentials. The customer
 * generates an API Key + API Secret on their Assently API Settings page; the
 * pair is Basic-encoded (`base64(key:secret)`) and POSTed to `/apiv3/token`
 * with `grant_type=client_credentials`, returning a short-lived bearer token.
 *
 * The Connect Link credential form is the shared `oauth2ClientCredentials`
 * template (API Key → `clientId`, API Secret → `clientSecret`), which performs
 * the initial token exchange. `refreshCredentials` below re-runs the grant
 * using the key/secret persisted on `credentials.extra`.
 *
 * Assently does not offer an Authorization-Code (browser-redirect) flow, so
 * `buildAuthUrl` returns the docs page and `exchangeCode` is unused.
 *
 * Docs: https://developer.assently.com/reference/authentication
 */

import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

const AUTH_DOCS_URL = 'https://developer.assently.com/reference/authentication'

interface AssentlyTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

export function buildAuthUrl(_state: string): string {
  // No redirect-based grant — credentials are entered via the Connect Link form.
  return AUTH_DOCS_URL
}

export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error(
    'Assently uses OAuth2 client-credentials; connect via the API Key + Secret credential form, not an authorization code.',
  )
}

/**
 * Re-mint the bearer token from the API Key + Secret stored on
 * `credentials.extra` (set by the `oauth2ClientCredentials` form helper).
 */
export async function refreshCredentials(
  credentials: Credentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const apiKey = String(credentials.extra?.['clientId'] ?? '')
  const apiSecret = String(credentials.extra?.['clientSecret'] ?? '')
  if (!apiKey || !apiSecret) return credentials

  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Assently token endpoint returned ${res.status}: ${text}`)
  }
  const json = (await res.json()) as AssentlyTokenResponse
  return {
    accessToken: json.access_token,
    expiresAt:
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000)
        : undefined,
    extra: credentials.extra ?? {},
  }
}
