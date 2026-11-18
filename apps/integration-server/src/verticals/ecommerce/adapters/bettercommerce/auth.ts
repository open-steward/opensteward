/**
 * BetterCommerce OAuth 2.0 client-credentials helpers.
 *
 * BetterCommerce uses the client-credentials grant — there is NO
 * authorization-code / redirect flow for end users. Merchants supply a
 * `clientId` (their API Key) and `clientSecret` (Shared Secret) from the
 * BetterCommerce dashboard (Settings → API Token). These are exchanged for
 * a Bearer token with a 24-hour TTL. The platform does not currently issue
 * refresh tokens; re-call the token endpoint when the token expires.
 *
 * Token endpoint: POST https://auth.bettercommerce.io/oAuth/Token
 * Body (form-encoded): client_id=…&client_secret=…&grant_type=client_credentials
 * Response: { access_token: string, expires_in: number, token_type: "Bearer" }
 *
 * Docs: https://docs.commerceapi.bettercommerce.io/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL, TOKEN_PATH, GRANT_TYPE } from './constants'

interface BetterCommerceTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

/**
 * Exchange a client_id / client_secret pair for an access token.
 * The caller should store the returned `expiresAt` and call this again
 * before the token expires (TTL is typically 86 400 s / 24 h).
 */
export async function obtainToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: GRANT_TYPE,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const { data } = await axios.post<BetterCommerceTokenResponse>(
    `${AUTH_URL}${TOKEN_PATH}`,
    body.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope,
    extra: { clientId, clientSecret },
  }
}
