/**
 * Wayfair OAuth2 client_credentials helpers.
 *
 * Wayfair uses Auth0 as its identity provider. Suppliers obtain a
 * client_id / client_secret from the Wayfair Partner Home developer portal.
 * Tokens are short-lived (~24 h) and must be refreshed by re-running the
 * client_credentials flow with the same credentials (no refresh_token).
 *
 * Token endpoint: https://sso.auth.wayfair.com/oauth/token
 * Audience (prod): https://api.wayfair.com/
 * Audience (sandbox): https://sandbox.api.wayfair.com/
 *
 * Docs: https://developer.wayfair.io/posts/api-access-tokens
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL, PROD_AUDIENCE, SANDBOX_AUDIENCE } from './constants'

interface WayfairTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  scope?: string
}

/**
 * Fetch a fresh access token using the OAuth2 client_credentials grant.
 *
 * @param clientId     Application client_id from Partner Home.
 * @param clientSecret Application client_secret from Partner Home.
 * @param sandbox      When `true` use the sandbox audience; otherwise prod.
 */
export async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  sandbox: boolean = false,
): Promise<Credentials> {
  const audience = sandbox ? SANDBOX_AUDIENCE : PROD_AUDIENCE

  const { data } = await axios.post<WayfairTokenResponse>(
    TOKEN_URL,
    {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  // Wayfair tokens have a finite lifetime (typically 86400 s = 24 h).
  const expiresAt: Date | undefined =
    data.expires_in != null
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresAt,
  }
}
