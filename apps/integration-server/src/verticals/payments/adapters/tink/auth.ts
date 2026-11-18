/**
 * Tink client token (OAuth 2.0 client credentials).
 *
 * "The __Client Token__ - Allows access to requests made by your app.
 *  Endpoints containing `Client Token` under `Allowed Token Types` in the
 *  [API Reference](https://docs.tink.com/api) can be accessed by providing
 *  this token."
 *
 *   curl -v -X POST https://api.tink.com/api/v1/oauth/token \
 *   -d 'client_id={YOUR_CLIENT_ID}' \
 *   -d 'client_secret={YOUR_CLIENT_SECRET}' \
 *   -d 'grant_type=client_credentials' \
 *   -d 'scope=authorization:grant,user:create'
 *
 * "Access Token Response for a client which expires after 30 mins (no refresh
 *  token provided, use the same endpoint again to get a new access token)."
 * Response example: `{ "access_token", "token_type": "bearer",
 * "expires_in": 1800, "scope": "authorization:grant,user:create" }`.
 *  https://docs.tink.com/resources/api-setup/get-access-token
 *
 * The API reference's grant_type enum is authorization_code,
 * client_credentials and urn:ietf:params:oauth:grant-type:jwt-bearer: there
 * is no refresh_token grant, so a refresh is a new client_credentials grant.
 * Its `scope` parameter: "When grant type is `client_credentials` ... can be
 * used to narrow the scope of the token". Scopes are comma-separated, as in
 * the example above.
 */
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_SCOPES, OAUTH_TOKEN_URL } from './constants'

export interface TinkTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

/** The per-connection settlement account a connection reads. */
export interface TinkSettlementIds {
  merchantId: string
  accountId: string
}

/**
 * Everything a connection needs to mint its own client token and read its
 * settlement account: its Tink Console app's client_id/client_secret ("Make
 * sure you use the correct `client_id` and `client_secret` found in the
 * Tink Console") and the account's ids. Stored in credentials.extra, as
 * checkout-com stores its client credentials, because a refresh is a new
 * client_credentials grant.
 */
export interface TinkConnection extends TinkSettlementIds {
  clientId: string
  clientSecret: string
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** The connection's merchantId/accountId, or undefined for either one that is absent. */
export function settlementIdsFrom(credentials: Credentials): Partial<TinkSettlementIds> {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return { merchantId: str(extra['merchantId']), accountId: str(extra['accountId']) }
}

/** The connection's app credentials and settlement ids, or undefined when any is absent. */
export function connectionFrom(credentials: Credentials): TinkConnection | undefined {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  const clientId = str(extra['clientId'])
  const clientSecret = str(extra['clientSecret'])
  const { merchantId, accountId } = settlementIdsFrom(credentials)
  if (!clientId || !clientSecret || !merchantId || !accountId) return undefined
  return { clientId, clientSecret, merchantId, accountId }
}

/** POST /api/v1/oauth/token with grant_type=client_credentials. */
export async function mintClientToken(
  clientId: string,
  clientSecret: string,
  scopes: readonly string[],
  fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a),
): Promise<TinkTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  })
  if (scopes.length > 0) body.set('scope', scopes.join(','))
  const res = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(
      new Error(`Tink token endpoint returned ${res.status}: ${text.slice(0, 500)}`),
      { statusCode: res.status },
    )
  }
  const data = (await res.json()) as TinkTokenResponse
  if (typeof data?.access_token !== 'string' || data.access_token === '') {
    throw new Error('Tink token endpoint returned no access_token')
  }
  return data
}

/**
 * Credentials for a minted client token. There is no refresh token; the
 * expiry is `expires_in` from now, which is what makes the token refresher
 * call refreshCredentials (a new grant) before it runs out.
 */
export function tokenCredentials(
  token: TinkTokenResponse,
  conn: TinkConnection,
  now: number = Date.now(),
): Credentials {
  return {
    accessToken: token.access_token,
    expiresAt:
      typeof token.expires_in === 'number' && Number.isFinite(token.expires_in)
        ? new Date(now + token.expires_in * 1000)
        : undefined,
    scope: token.scope,
    extra: {
      clientId: conn.clientId,
      clientSecret: conn.clientSecret,
      merchantId: conn.merchantId,
      accountId: conn.accountId,
    },
  }
}

/** A client_credentials grant for the connection's own app, as Credentials. */
export async function mintCredentials(conn: TinkConnection): Promise<Credentials> {
  const token = await mintClientToken(conn.clientId, conn.clientSecret, DEFAULT_SCOPES)
  return tokenCredentials(token, conn)
}
