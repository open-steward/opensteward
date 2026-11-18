/**
 * Zuora OAuth: client credentials only.
 *
 * https://developer.zuora.com/v1-api-reference/api/oauth/createtoken.md —
 * "Endpoint: POST /oauth/token"; request fields (application/x-www-form-urlencoded)
 * `client_id`, `client_secret` and `grant_type`: "The value of this parameter
 * must be client_credentials." The response carries `access_token`,
 * `expires_in` ("The number of seconds until the token expires") and `scope`.
 * The OAuth client "must have been created using the Zuora UI", so there is no
 * authorization-code redirect and no refresh token: a refresh re-runs this
 * exchange with the stored client.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

interface ZuoraTokenResponse {
  access_token: string
  expires_in?: number
  scope?: string
  token_type?: string
}

/**
 * Mint a token at `<baseUrl>/oauth/token`. `baseUrl` is the connection's
 * environment host from the documented table (constants.ts), resolved once at
 * exchange and stored, so every later request and refresh reads one value.
 */
export async function fetchToken(
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<Credentials> {
  if (!clientId || !clientSecret) {
    throw new Error('Zuora needs the OAuth client ID and client secret created in the Zuora UI.')
  }
  const { data } = await axios.post<ZuoraTokenResponse>(
    `${baseUrl}/oauth/token`,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    },
  )
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresAt:
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    extra: { clientId, clientSecret, baseUrl },
  }
}
