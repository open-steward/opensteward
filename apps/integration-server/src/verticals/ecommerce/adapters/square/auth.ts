/**
 * Square OAuth2 helpers.
 *
 * v1 skips interactive OAuth — users pre-generate tokens in the Square
 * Developer Console and provide them via POST /v1/connections.
 *
 * `refreshCredentials` calls the Square token endpoint with
 * grant_type=refresh_token. Refresh tokens may rotate on each call,
 * so we always store the latest returned value.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

interface SquareTokenResponse {
  access_token: string
  refresh_token?: string
  expires_at?: string
  token_type?: string
  merchant_id?: string
}

/**
 * Exchange is not supported — users must supply tokens directly.
 */
export function exchangeCode(): never {
  throw new Error(
    'Square adapter v1 does not support interactive OAuth. ' +
      'Use POST /v1/connections with { accessToken, refreshToken, expiresAt, ' +
      'extra: { clientId, clientSecret, merchantId, environment } }.',
  )
}

/**
 * Refresh an access token using the refresh token grant.
 */
export async function refreshAccessToken(
  credentials: Credentials,
): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Square refresh requires clientId and clientSecret in credentials.extra')
  }
  if (!credentials.refreshToken) {
    throw new Error('Square refresh requires a refreshToken')
  }

  const { data } = await axios.post<SquareTokenResponse>(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: data.expires_at ? new Date(data.expires_at) : credentials.expiresAt,
    extra: {
      ...credentials.extra,
      merchantId: data.merchant_id ?? credentials.extra?.['merchantId'],
    },
  }
}
