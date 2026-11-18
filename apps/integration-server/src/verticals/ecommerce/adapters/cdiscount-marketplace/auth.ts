/**
 * Octopia Seller API auth — OAuth2 client-credentials, per seller.
 *
 * `POST {TOKEN_ENDPOINT}` with `grant_type=client_credentials` +
 * `client_id` + `client_secret` (form-encoded) returns `{access_token,
 * expires_in}`. Tokens live 2h; the token endpoint itself is rate-limited to
 * 500 calls/hour, so a caller must cache the token and re-mint only via
 * `refreshCredentials` when it is close to expiring — never per request.
 *
 * Every subsequent API call also requires a `SellerId` header (the seller's
 * Octopia identifier) — that lives in `credentials.extra.sellerId` and is
 * attached by `client.ts`, not by auth.
 *
 * Docs: https://developer.octopia-io.net/user-guides/api-credentials/
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_ENDPOINT, TOKEN_LIFETIME_SECONDS } from './constants'

/** No browser redirect — the Connect page collects credentials directly. */
export function buildAuthUrl(): string {
  return 'https://developer.octopia-io.net/user-guides/api-credentials/'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Cdiscount Marketplace (Octopia) uses OAuth2 client-credentials, not an authorization-code ' +
      'redirect. POST credentials to /v1/connections with body ' +
      '`{platform: "cdiscount-marketplace", credentials: {clientId, clientSecret, sellerId}}`.',
  )
}

export interface OctopiaTokenResult {
  accessToken: string
  expiresAt: Date
}

interface OctopiaTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

/**
 * Mint a fresh Octopia access token via the client-credentials grant.
 * Callers MUST cache the result until shortly before `expiresAt` — the
 * token endpoint is rate-limited to 500 calls/hour (see constants.ts).
 */
export async function fetchToken(
  clientId: string,
  clientSecret: string,
): Promise<OctopiaTokenResult> {
  const res = await axios.post<OctopiaTokenResponse>(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )
  if (!res.data.access_token) {
    throw new Error('Octopia token endpoint returned an empty access_token')
  }
  // Prefer the platform's own expires_in when present, minus a 5-minute
  // safety margin; fall back to the documented 2h lifetime otherwise.
  const lifetime =
    typeof res.data.expires_in === 'number'
      ? Math.max(res.data.expires_in - 300, 60)
      : TOKEN_LIFETIME_SECONDS
  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + lifetime * 1000),
  }
}

/**
 * Re-mint an Octopia token from the clientId/clientSecret stashed in
 * `credentials.extra` at connect time. Invoked by the auth middleware only
 * when `isTokenExpired(credentials.expiresAt)` — i.e. at most once every
 * ~1h55m per connection, which comfortably respects the 500/h token-endpoint
 * limit even across many connections.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error(
      'Cdiscount Marketplace refreshCredentials requires clientId and clientSecret in ' +
        'credentials.extra. Re-create the connection with the required fields.',
    )
  }
  const { accessToken, expiresAt } = await fetchToken(clientId, clientSecret)
  return { ...credentials, accessToken, expiresAt }
}
