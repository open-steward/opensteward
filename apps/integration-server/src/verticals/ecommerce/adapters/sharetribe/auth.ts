/**
 * Sharetribe Flex OAuth2 helpers.
 *
 * The Sharetribe Integration API uses the OAuth2 `client_credentials` grant
 * type to issue short-lived access tokens (TTL ~1 hour). There is no
 * per-user authorization URL — credentials are minted directly from the
 * marketplace's clientId and clientSecret.
 *
 * Token request:
 *   POST https://flex-api.sharetribe.com/v1/auth/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=client_credentials&client_id=...&client_secret=...&scope=integ
 *
 * Docs: https://www.sharetribe.com/api-reference/authentication.html
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_BASE_URL, INTEGRATION_SCOPE, TOKEN_PATH } from './constants'

interface SharetribeTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  refresh_token?: string
}

/**
 * Obtain an Integration API access token via client_credentials grant.
 * Returns credentials with `expiresAt` so the shared refresh logic kicks in.
 */
export async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: INTEGRATION_SCOPE,
  })

  const { data } = await axios.post<SharetribeTokenResponse>(
    `${AUTH_BASE_URL}${TOKEN_PATH}`,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    expiresAt,
  }
}

/**
 * Refresh an expired access token using the stored refresh_token.
 * Falls back to a new client_credentials grant if no refresh token is stored.
 */
export async function refreshToken(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (credentials.refreshToken) {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refreshToken,
      })

      const { data } = await axios.post<SharetribeTokenResponse>(
        `${AUTH_BASE_URL}${TOKEN_PATH}`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        },
      )

      const expiresAt = new Date(Date.now() + data.expires_in * 1000)

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? credentials.refreshToken,
        scope: data.scope,
        expiresAt,
      }
    } catch {
      // Fall through to client_credentials grant
    }
  }

  // No refresh token — re-issue via client_credentials
  return fetchClientCredentialsToken(clientId, clientSecret)
}
