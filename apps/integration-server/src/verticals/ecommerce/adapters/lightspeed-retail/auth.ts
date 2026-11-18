/**
 * Lightspeed Retail OAuth2 helpers.
 *
 * v1 skips interactive OAuth — users pre-generate tokens via the
 * Lightspeed developer portal and provide them via POST /v1/connections.
 *
 * `refreshAccessToken` calls the R-Series token endpoint with
 * grant_type=refresh_token. Refresh tokens are long-lived; access tokens
 * expire in ~30 minutes.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

interface LightspeedTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

/**
 * Exchange is not supported — users must supply tokens directly.
 */
export function exchangeCode(): never {
  throw new Error(
    'Lightspeed Retail adapter v1 does not support interactive OAuth. ' +
      'Use POST /v1/connections with { accessToken, refreshToken, expiresAt, ' +
      'extra: { clientId, clientSecret, accountId } }.',
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
    throw new Error('Lightspeed Retail refresh requires clientId and clientSecret in credentials.extra')
  }
  if (!credentials.refreshToken) {
    throw new Error('Lightspeed Retail refresh requires a refreshToken')
  }

  const { data } = await axios.post<LightspeedTokenResponse>(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : credentials.expiresAt

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt,
    extra: {
      ...credentials.extra,
    },
  }
}
