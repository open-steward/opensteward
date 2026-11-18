/**
 * Soldo Business API — OAuth 2.0 Client Credentials authentication.
 *
 * Soldo uses client_credentials grant only: no authorization-code flow,
 * no redirect URI. API credentials (client_id + client_secret) are issued
 * via the Soldo web app under Integrations > Business API.
 *
 * Token request: POST https://api.soldo.com/oauth/authorize
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: client_id=...&client_secret=...
 *
 * Tokens expire after 7200 seconds (2 h). Re-authenticate on expiry or 401.
 * Docs: https://developer.soldo.com/docs/standard-authentication
 */

import axios from 'axios'
import { SOLDO_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

interface SoldoTokenResponse {
  access_token: string
  token_type: string
  expires_in: number | string
  refresh_token?: string
}

export async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<SoldoTokenResponse>(
    SOLDO_TOKEN_URL,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresIn =
    typeof data.expires_in === 'string' ? parseInt(data.expires_in, 10) : data.expires_in

  return {
    accessToken: data.access_token,
    // Soldo may return a refresh_token; store if present
    refreshToken: data.refresh_token ?? undefined,
    expiresAt: new Date(Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 7200) * 1000),
  }
}
