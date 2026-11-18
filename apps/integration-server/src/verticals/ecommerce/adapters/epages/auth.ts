/**
 * ePages Beyond auth — custom (private) app, OAuth2 client_credentials.
 *
 * Beyond has two ways to authorize an app (ng-apps.html#app-authorization,
 * linked from https://developer.epages.com/beyond-docs/):
 *  - a store-listed app using `authorization_code` — requires ePages review
 *    before a real client_id/secret is issued. NOT implemented here.
 *  - a "custom app" the merchant creates themselves in their shop's cockpit
 *    (Apps > Custom apps), which immediately yields a client_id/client_secret
 *    scoped to that one shop. This is the flow this adapter implements.
 *
 * Token endpoint: `POST https://{shop}.beyondshop.cloud/api/oauth/token`
 * (https://api-docs.beyondshop.cloud/ng-auth-auth-public-api.html#resources-tokens-client).
 * Client credentials are sent as an HTTP Basic `Authorization` header
 * (`-u 'clientId:clientSecret'`), NOT in the form body — confirmed by the
 * doc's own curl example:
 *
 *   curl '.../api/oauth/token' -u 'clientId-1:password' -X POST \
 *     -d 'grant_type=client_credentials'
 *
 * This is why the shared `oauth2ClientCredentials` helper (which posts
 * `client_id`/`client_secret` in the body) is NOT used here — it would send
 * a request shape Beyond's token endpoint does not document accepting.
 *
 * The client_credentials grant response carries no `refresh_token`
 * (confirmed: only the `authorization_code` and `refresh_token` grant
 * examples in the docs include one) — `refreshCredentials` re-runs the same
 * client_credentials grant rather than using a refresh token.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { GRANT_CLIENT_CREDENTIALS, TOKEN_REFRESH_BUFFER_MS, SHOP_HOST_SUFFIX } from './constants'

/** `https://{shop}.beyondshop.cloud/api/oauth/token` */
export function tokenUrl(shop: string): string {
  return `https://${shop}.${SHOP_HOST_SUFFIX}/api/oauth/token`
}

/** `https://{shop}.beyondshop.cloud/api` */
export function apiBaseUrl(shop: string): string {
  return `https://${shop}.${SHOP_HOST_SUFFIX}/api`
}

interface EpagesTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
  refresh_token?: string
}

export interface EpagesTokenResult {
  accessToken: string
  expiresAt: Date
  scope?: string
}

/**
 * Run the client_credentials grant against `shop`'s token endpoint using
 * HTTP Basic auth for the client id/secret.
 */
export async function fetchClientCredentialsToken(
  shop: string,
  clientId: string,
  clientSecret: string,
): Promise<EpagesTokenResult> {
  const { data } = await axios.post<EpagesTokenResponse>(
    tokenUrl(shop),
    new URLSearchParams({ grant_type: GRANT_CLIENT_CREDENTIALS }).toString(),
    {
      auth: { username: clientId, password: clientSecret },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 30_000,
    },
  )
  if (!data.access_token) {
    throw new Error('ePages Beyond token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, data.expires_in * 1000 - TOKEN_REFRESH_BUFFER_MS)
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + ttlMs),
    scope: data.scope,
  }
}

/**
 * Exchange (shop, clientId, clientSecret) for `Credentials`. Everything the
 * client needs to re-mint a token later is stashed in `extra` — this is what
 * `client.ts` and `refreshCredentials` read back.
 */
export async function exchangeClientCredentials(
  shop: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { accessToken, expiresAt, scope } = await fetchClientCredentialsToken(
    shop,
    clientId,
    clientSecret,
  )
  return {
    accessToken,
    expiresAt,
    scope,
    extra: { shop, clientId, clientSecret },
  }
}

/**
 * Re-run the client_credentials grant. There is no refresh_token for this
 * grant type, so "refresh" means "authenticate again" — identical to
 * OroCommerce's client-credentials adapter.
 */
export async function refreshClientCredentials(credentials: Credentials): Promise<Credentials> {
  const shop = credentials.extra?.['shop'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!shop || !clientId || !clientSecret) {
    throw new Error(
      'ePages Beyond refreshCredentials requires shop, clientId and clientSecret in ' +
        'credentials.extra — re-create the connection.',
    )
  }
  const { accessToken, expiresAt, scope } = await fetchClientCredentialsToken(
    shop,
    clientId,
    clientSecret,
  )
  return { ...credentials, accessToken, expiresAt, scope }
}
