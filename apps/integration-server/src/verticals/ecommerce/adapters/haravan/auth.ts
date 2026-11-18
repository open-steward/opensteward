/**
 * Haravan OAuth2 / OIDC helpers.
 *
 * Haravan's OAuth app is global: one Connect app serves every merchant, and
 * the authorize + token endpoints live on `accounts.haravan.com` (not a
 * per-merchant host, unlike Shopify's `{shop}.myshopify.com`).
 *
 * Docs: https://docs.haravan.com/docs/get-started/create-app/
 *
 *   Step 2 — build the authorize URL:
 *     https://accounts.haravan.com/connect/authorize
 *       ?response_mode=query&response_type=code&scope=<scopes>
 *       &client_id=<id>&redirect_uri=<uri>
 *
 *   Step 3 — exchange the code:
 *     POST https://accounts.haravan.com/connect/token
 *       Content-Type: application/x-www-form-urlencoded
 *       grant_type=authorization_code&client_id=...&client_secret=...
 *       &code=...&redirect_uri=...
 *
 *     Response: { id_token, access_token, expires_in, token_type, scope,
 *     (optional) refresh_token }. The doc's own worked example returns
 *     `expires_in: 473040000` (~15 years) — Haravan's "long-lived
 *     access_token" install option is long-lived in practice even though the
 *     field is technically an expiry. A `refresh_token` is documented as
 *     optional/not always issued, so `refreshCredentials` below falls back to
 *     returning the credentials unchanged when the platform issued none —
 *     matching the no-refresh-token adapters elsewhere in this vertical
 *     (see WixAdapter) rather than throwing.
 *
 *   Step 4 — call the API: `Authorization: Bearer <access_token>` (not a
 *     custom header, unlike Shopify's `X-Shopify-Access-Token`).
 *
 * No PKCE (code_challenge/code_verifier) is documented anywhere in the
 * install flow.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_HOST } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_mode: 'query',
    response_type: 'code',
    scope: scopes.join(' '),
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTH_HOST}/connect/authorize?${params.toString()}`
}

interface HaravanTokenResponse {
  access_token: string
  id_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  refresh_token?: string
}

function toCredentials(data: HaravanTokenResponse): Credentials {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    // Only set an expiry when Haravan reports one AND also issued a refresh
    // token — an expiry with no way to renew it would just make the sync
    // worker treat a perfectly usable (~15-year) token as needing a refresh
    // that can never succeed.
    expiresAt:
      data.expires_in != null && data.refresh_token
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
  }
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<HaravanTokenResponse>(
    `${AUTH_HOST}/connect/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return toCredentials(data)
}

/**
 * Renew an access token via `grant_type=refresh_token`. Only called when the
 * connection actually holds a `refreshToken` — Haravan does not always issue
 * one (see module doc), and there is no documented refresh flow to fall back
 * to when it did not.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<HaravanTokenResponse>(
    `${AUTH_HOST}/connect/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return toCredentials(data)
}
