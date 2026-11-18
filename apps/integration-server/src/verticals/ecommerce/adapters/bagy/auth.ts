/**
 * Bagy auth helpers.
 *
 * Bagy uses OAuth 2.0 with a per-store authorisation flow:
 *  1. Redirect the merchant to `https://{domain}/auth.php` with
 *     `response_type=code`, `consumer_key`, and `callback` parameters.
 *  2. Exchange the returned `code` for tokens by POSTing to
 *     `https://{api_address}/auth` with `consumer_key`, `consumer_secret`,
 *     and `code`.
 *  3. The response contains `access_token` (valid ~24 h), `refresh_token`
 *     (valid ~30 days), `api_address` (the store's base URL), and expiry fields.
 *  4. All subsequent requests append `?access_token={token}` as a query parameter.
 *
 * The `api_address` returned at step 3 is stored in `credentials.extra.apiAddress`
 * and used by the client to construct the base URL.
 *
 * Docs: https://developers.bagy.com.br/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(
  domain: string,
  consumerKey: string,
  callbackUrl: string,
): string {
  const base = domain.startsWith('http') ? domain : `https://${domain}`
  const params = new URLSearchParams({
    response_type: 'code',
    consumer_key: consumerKey,
    callback: callbackUrl,
  })
  return `${base.replace(/\/$/, '')}/auth.php?${params.toString()}`
}

interface BagyTokenResponse {
  access_token: string
  refresh_token?: string
  date_activated?: string
  date_expiration_access_token?: string
  date_expiration_refresh_token?: string
  /** The store's API host URL returned by Bagy (field name is `api_host`). */
  api_host?: string
}

export async function exchangeCode(
  apiAddress: string,
  code: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<Credentials> {
  const base = apiAddress.startsWith('http') ? apiAddress : `https://${apiAddress}`
  const { data } = await axios.post<BagyTokenResponse>(
    `${base.replace(/\/$/, '')}/auth`,
    { consumer_key: consumerKey, consumer_secret: consumerSecret, code },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )

  const resolvedApiAddress = data.api_host ?? apiAddress
  const expiresAt = data.date_expiration_access_token
    ? new Date(data.date_expiration_access_token)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    extra: {
      apiAddress: resolvedApiAddress,
      consumerKey,
      consumerSecret,
    },
  }
}

export async function refreshAccessToken(
  apiAddress: string,
  refreshToken: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<Credentials> {
  const base = apiAddress.startsWith('http') ? apiAddress : `https://${apiAddress}`
  // Bagy refresh only requires the refresh_token query parameter —
  // consumer credentials are NOT needed for token renewal.
  const { data } = await axios.get<BagyTokenResponse>(
    `${base.replace(/\/$/, '')}/auth`,
    {
      params: { refresh_token: refreshToken },
      headers: { Accept: 'application/json' },
    },
  )

  const resolvedApiAddress = data.api_host ?? apiAddress
  const expiresAt = data.date_expiration_access_token
    ? new Date(data.date_expiration_access_token)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    extra: {
      apiAddress: resolvedApiAddress,
      consumerKey,
      consumerSecret,
    },
  }
}
