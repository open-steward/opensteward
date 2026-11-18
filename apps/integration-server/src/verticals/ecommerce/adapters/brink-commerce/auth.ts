/**
 * Brink Commerce OAuth 2.0 client-credentials helpers.
 *
 * Brink uses client_credentials grant. The token endpoint lives at:
 *   POST https://management.{region}.{account}.brinkcommerce.io/auth/oauth2/token
 *
 * Callers supply clientId + clientSecret (from Merchant Portal → Settings →
 * API Clients) via HTTP Basic auth. The returned access token is valid for
 * one hour; the adapter refreshes it proactively by re-running the grant.
 *
 * All Management and Order API requests also require an `x-api-key` header.
 * This key is static and stored alongside the client credentials in
 * `credentials.extra.apiKey`.
 *
 * Docs: https://docs.brinkcommerce.com/getting-started/essentials/authentication
 */

import type { Credentials } from '@opensteward/shared'
import { authBaseUrl, DEFAULT_SCOPES } from './constants'

interface BrinkTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

/**
 * Exchange client credentials for an access token.
 *
 * @param clientId      OAuth client ID
 * @param clientSecret  OAuth client secret
 * @param region        Merchant region, e.g. `eu-west-1`
 * @param account       Merchant account name, e.g. `mycompany`
 * @param apiKey        Static x-api-key from Merchant Portal
 * @param scopes        OAuth scopes to request (defaults to DEFAULT_SCOPES)
 */
export async function fetchAccessToken(
  clientId: string,
  clientSecret: string,
  region: string,
  account: string,
  apiKey: string,
  scopes: string[] = DEFAULT_SCOPES,
): Promise<Credentials> {
  const url = `${authBaseUrl(region, account)}/oauth2/token`
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: scopes.join(' '),
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Brink Commerce token endpoint ${url} returned ${res.status}: ${text}`)
  }

  const json = (await res.json()) as BrinkTokenResponse

  const expiresAt =
    typeof json.expires_in === 'number'
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined

  return {
    accessToken: json.access_token,
    expiresAt,
    scope: json.scope,
    extra: {
      clientId,
      clientSecret,
      region,
      account,
      apiKey,
    },
  }
}

/**
 * Refresh an expiring access token by re-running the client-credentials grant.
 * All the required fields are stored in `credentials.extra` from the initial
 * `fetchAccessToken` call.
 */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = extra['clientId'] as string | undefined
  const clientSecret = extra['clientSecret'] as string | undefined
  const region = extra['region'] as string | undefined
  const account = extra['account'] as string | undefined
  const apiKey = extra['apiKey'] as string | undefined

  if (!clientId || !clientSecret || !region || !account || !apiKey) {
    throw new Error(
      'Brink Commerce refreshAccessToken: credentials.extra is missing clientId, clientSecret, region, account, or apiKey.',
    )
  }

  return fetchAccessToken(clientId, clientSecret, region, account, apiKey)
}
