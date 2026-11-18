/**
 * Revel Systems auth helpers.
 *
 * Revel supports two auth modes:
 * 1. API Key: Users supply `apiKey` and `apiSecret` in credentials.extra.
 *    These are sent as `API-AUTHENTICATION` header (`{apiKey}:{apiSecret}`).
 * 2. OAuth2: Standard code exchange flow (less common for self-hosted).
 *
 * v1 focuses on API key auth — users create keys in the Revel Management
 * Console and provide them via POST /v1/connections.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { buildBaseUrl, OAUTH_TOKEN_PATH } from './constants'

interface RevelTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

/**
 * Exchange is not supported — users must supply API keys directly.
 */
export function exchangeCode(): never {
  throw new Error(
    'Revel adapter v1 does not support interactive OAuth. ' +
      'Use POST /v1/connections with { accessToken, ' +
      'extra: { subdomain, apiKey, apiSecret } }.',
  )
}

/**
 * Refresh credentials. For API key auth, this is a no-op (keys don't expire).
 * For OAuth2, calls the token endpoint with the refresh token.
 */
export async function refreshAccessToken(
  credentials: Credentials,
): Promise<Credentials> {
  // API key mode — keys don't expire
  if (credentials.extra?.['apiKey'] && credentials.extra?.['apiSecret']) {
    return credentials
  }

  // OAuth2 mode
  if (!credentials.expiresAt) {
    return credentials
  }

  const subdomain = credentials.extra?.['subdomain'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!subdomain || !clientId || !clientSecret) {
    throw new Error('Revel refresh requires subdomain, clientId, and clientSecret in credentials.extra')
  }
  if (!credentials.refreshToken) {
    throw new Error('Revel refresh requires a refreshToken')
  }

  const tokenUrl = `${buildBaseUrl(subdomain)}${OAUTH_TOKEN_PATH}`

  const { data } = await axios.post<RevelTokenResponse>(tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : credentials.expiresAt,
    extra: credentials.extra,
  }
}
