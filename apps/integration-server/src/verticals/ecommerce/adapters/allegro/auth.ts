/**
 * Allegro OAuth2 auth helpers — authorization-code + refresh-token flow.
 *
 * Allegro uses standard OAuth2 authorization code grant. Sellers consent
 * via Allegro's OAuth2 authorize endpoint; we exchange the code for
 * access + refresh tokens. Access tokens expire in 12 hours, refresh
 * tokens are long-lived.
 *
 * Credentials layout:
 *   - `accessToken`        Allegro user access token (12h TTL)
 *   - `refreshToken`       Allegro refresh token (long-lived)
 *   - `expiresAt`          Date the access token expires
 *   - `extra.clientId`     Allegro app client id
 *   - `extra.clientSecret` Allegro app client secret
 *   - `extra.environment`  'production' | 'sandbox'
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { basicAuth } from '@opensteward/shared'
import {
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
  TOKEN_BUFFER_MS,
} from './constants'

function oauthAuthorizeUrl(environment: string): string {
  const env = ENVIRONMENTS[environment] ?? ENVIRONMENTS['production']!
  return `https://${env.authHost}/auth/oauth/authorize`
}

function oauthTokenUrl(environment: string): string {
  const env = ENVIRONMENTS[environment] ?? ENVIRONMENTS['production']!
  return `https://${env.authHost}/auth/oauth/token`
}


/**
 * Build the Allegro OAuth2 consent URL.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  environment = DEFAULT_ENVIRONMENT,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  return `${oauthAuthorizeUrl(environment)}?${params.toString()}`
}

interface AllegroTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  environment = DEFAULT_ENVIRONMENT,
): Promise<Credentials> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await axios.post<AllegroTokenResponse>(
    oauthTokenUrl(environment),
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    },
  )
  const { access_token, refresh_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('Allegro token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: { clientId, clientSecret, environment },
  }
}

/**
 * Refresh Allegro credentials using the stored refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken
  const environment =
    (credentials.extra?.['environment'] as string | undefined) ?? DEFAULT_ENVIRONMENT
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Allegro refreshCredentials requires refreshToken plus clientId and clientSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await axios.post<AllegroTokenResponse>(
    oauthTokenUrl(environment),
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    },
  )
  const { access_token, refresh_token: newRefresh, expires_in } = res.data
  if (!access_token) {
    throw new Error('Allegro token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: access_token,
    refreshToken: newRefresh ?? refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
