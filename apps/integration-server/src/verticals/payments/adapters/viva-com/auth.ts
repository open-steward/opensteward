/**
 * Viva.com OAuth2 client-credentials token.
 *
 * Docs: https://developer.viva.com/integration-reference/oauth2-authentication/
 * "Base64-encode your credentials in the format Client_ID:Client_Secret" …
 * "curl -L -X POST 'https://demo-accounts.vivapayments.com/connect/token'
 *  -H 'Content-Type: application/x-www-form-urlencoded'
 *  -H 'Authorization: Basic …' --data-urlencode 'grant_type=client_credentials'"
 * Response: { "access_token", "expires_in": 3600, "token_type": "Bearer", "scope" }.
 *
 * Viva documents no authorization-code flow and no refresh token, so a
 * "refresh" mints a new token from the stored client credentials.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_TOKEN_URL } from './constants'

interface VivaComTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
}

export async function fetchToken(clientId: string, clientSecret: string): Promise<Credentials> {
  if (!clientId || !clientSecret) {
    throw new Error('Viva.com needs a Client ID and Client Secret to request an access token')
  }
  const { data } = await axios.post<VivaComTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  )
  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: { clientId, clientSecret },
  }
}
