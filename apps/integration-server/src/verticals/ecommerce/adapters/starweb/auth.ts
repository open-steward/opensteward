/**
 * Starweb OAuth 2.0 client-credentials helpers.
 *
 * Starweb uses the OAuth 2.0 client-credentials grant. Credentials
 * (client_id + client_secret) are generated in the Starweb back-office
 * and are scoped to a specific shop. The token endpoint is per-shop:
 *
 *   POST https://{shopId}.starwebserver.se/api/v2/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&client_id=...&client_secret=...
 *
 * The response carries an `access_token` and `expires_in` (seconds).
 * Adapters should refresh the token when it is expired — the
 * `refreshCredentials` implementation calls this same endpoint.
 *
 * Docs: https://api-docs.starweb.se/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { tokenUrl } from './constants'

interface StarwebTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

/**
 * Exchange client credentials for a Bearer access token.
 * `shopId` is the Starweb shop subdomain, e.g. `myshop` →
 * `https://myshop.starwebserver.se/api/v2/token`.
 */
export async function fetchAccessToken(
  shopId: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const url = tokenUrl(shopId)
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const { data } = await axios.post<StarwebTokenResponse>(url, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })

  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    expiresAt,
    extra: { clientId, clientSecret, shopId },
  }
}
