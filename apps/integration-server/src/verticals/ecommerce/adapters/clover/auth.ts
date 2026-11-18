/**
 * Clover OAuth2 helpers.
 *
 * v1 skips interactive OAuth — users pre-generate tokens in the Clover
 * Developer Dashboard and provide them via POST /v1/connections.
 *
 * `refreshCredentials` is a no-op if no expiresAt is set (Clover tokens
 * can be long-lived). If expiresAt is set, it calls the token endpoint.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL, PRODUCTION_TOKEN_URL, type CloverEnvironment } from './constants'

interface CloverTokenResponse {
  access_token: string
}

/**
 * Interactive OAuth exchange is not supported — users must supply tokens
 * directly.
 */
export function exchangeCode(): never {
  throw new Error(
    'Clover adapter v1 does not support interactive OAuth. ' +
      'Use POST /v1/connections with { accessToken, ' +
      'extra: { merchantId, environment } }.',
  )
}

/**
 * Refresh an access token. Clover tokens may be long-lived; if no
 * expiresAt is set, returns credentials unchanged.
 */
export async function refreshAccessToken(
  credentials: Credentials,
): Promise<Credentials> {
  // If no expiry set, token is long-lived — no-op
  if (!credentials.expiresAt) {
    return credentials
  }

  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Clover refresh requires clientId and clientSecret in credentials.extra')
  }
  if (!credentials.refreshToken) {
    throw new Error('Clover refresh requires a refreshToken')
  }

  const env = (credentials.extra?.['environment'] as CloverEnvironment) ?? 'production'
  const tokenUrl = env === 'sandbox' ? TOKEN_URL : PRODUCTION_TOKEN_URL

  const { data } = await axios.get<CloverTokenResponse>(tokenUrl, {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      code: credentials.refreshToken,
    },
  })

  return {
    accessToken: data.access_token,
    refreshToken: credentials.refreshToken,
    expiresAt: credentials.expiresAt,
    extra: credentials.extra,
  }
}
