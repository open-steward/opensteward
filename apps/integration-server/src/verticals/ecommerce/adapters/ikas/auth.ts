/**
 * ikas OAuth2 client-credentials helpers.
 *
 * ikas uses the OAuth2 **client_credentials** grant — there is no
 * authorization-code flow and no per-user token exchange. Credentials are
 * a (clientId, clientSecret) pair generated for a Private App in the
 * merchant's own ikas admin (Apps → My Apps → More → Create Private App). The resulting access token expires after 14 400 s (4 hours)
 * and must be refreshed by repeating the POST.
 *
 * Token endpoint (on the merchant's store host, per the docs' curl example):
 *   POST https://<store_name>.myikas.com/api/admin/oauth/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&client_id=…&client_secret=…
 *
 * Docs: https://ikas.dev/docs/api/getting-started/authentication
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { tokenEndpoint, TOKEN_TTL_SECONDS } from './constants'

interface IkasTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

/**
 * Exchange a clientId + clientSecret for a bearer access token.
 * Returns a `Credentials` object whose `expiresAt` is set so the shared
 * `isTokenExpired` helper can trigger automatic refresh.
 */
export async function fetchAccessToken(
  storeName: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const { data } = await axios.post<IkasTokenResponse>(
    tokenEndpoint(storeName),
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 15_000,
    },
  )

  const ttl = data.expires_in ?? TOKEN_TTL_SECONDS
  const expiresAt = new Date(Date.now() + ttl * 1000)

  return {
    accessToken: data.access_token,
    expiresAt,
  }
}
