/**
 * Zalando zDirect OAuth2 client-credentials helpers.
 *
 * There is no authorization-code / redirect flow; authentication is
 * server-to-server.
 *
 * Token endpoint (https://developers.merchants.zalando.com/docs/requesting-access-token.html):
 *   "Use the /auth/token endpoint to request an access token."
 *   POST https://api(-sandbox).merchants.zalando.com/auth/token
 *   Authorization: Basic Base64(clientId:clientSecret)
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&scope=access_token_only
 *
 * The documented sample response has "expires_in": 7200 and no refresh token.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { PROD_BASE_URL, SANDBOX_BASE_URL, TOKEN_PATH, DEFAULT_SCOPE } from './constants'

interface ZalandoTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

/**
 * Fetch a new access token using the client-credentials grant.
 *
 * @param clientId     - OAuth client ID from the zDirect Portal
 * @param clientSecret - OAuth client secret from the zDirect Portal
 * @param sandbox      - Request the token from the sandbox host.
 */
export async function fetchAccessToken(
  clientId: string,
  clientSecret: string,
  sandbox = false,
): Promise<Credentials> {
  const basicCredential = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenUrl = `${sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL}${TOKEN_PATH}`

  const { data } = await axios.post<ZalandoTokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'client_credentials',
      scope: DEFAULT_SCOPE,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicCredential}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope,
  }
}

/**
 * The Zalando zDirect API uses client-credentials only — there is no
 * authorization-code / redirect flow. This function is a no-op placeholder
 * to satisfy the `EcommerceAdapter.getAuthUrl` contract; callers should not
 * send end-users through a browser redirect.
 */
export function buildAuthUrl(_clientId: string, _state: string): string {
  // zDirect does not use an authorization-code flow.
  throw new Error(
    'Zalando zDirect uses client-credentials only — there is no end-user OAuth redirect URL. ' +
      'Call fetchAccessToken() directly with your client credentials.',
  )
}
