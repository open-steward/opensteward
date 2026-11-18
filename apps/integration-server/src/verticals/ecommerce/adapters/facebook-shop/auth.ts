/**
 * Facebook Shop OAuth2 auth helpers — Facebook Login flow.
 *
 * Facebook uses standard OAuth2 authorization code grant via Facebook Login.
 * Users consent via Facebook's OAuth dialog; we exchange the code for a
 * short-lived token, then exchange that for a long-lived token (~60 days).
 *
 * Credentials layout:
 *   - `accessToken`          Facebook page/user access token
 *   - `expiresAt`            Date the access token expires
 *   - `extra.appId`          Facebook App ID
 *   - `extra.appSecret`      Facebook App Secret
 *   - `extra.catalogId`      Facebook Catalog ID (for product operations)
 *   - `extra.commerceAccountId` Commerce Account ID (for order operations)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  TOKEN_BUFFER_MS,
  DEFAULT_SCOPES,
  GRAPH_API_BASE,
} from './constants'

/**
 * Build the Facebook OAuth2 consent URL.
 */
export function buildAuthUrl(
  appId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = DEFAULT_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(','),
    response_type: 'code',
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface FacebookTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

/**
 * Exchange an authorization code for an access token, then exchange the
 * short-lived token for a long-lived one.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
): Promise<Credentials> {
  // Step 1: Exchange code for short-lived token
  const shortRes = await axios.get<FacebookTokenResponse>(OAUTH_TOKEN_URL, {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
    timeout: 30_000,
  })

  const shortToken = shortRes.data.access_token
  if (!shortToken) {
    throw new Error('Facebook token endpoint returned an empty access_token')
  }

  // Step 2: Exchange short-lived token for long-lived token
  const longRes = await axios.get<FacebookTokenResponse>(OAUTH_TOKEN_URL, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    },
    timeout: 30_000,
  })

  const { access_token, expires_in } = longRes.data
  if (!access_token) {
    throw new Error('Facebook long-lived token exchange returned an empty access_token')
  }

  // Long-lived tokens last ~60 days; default to 60 days if not specified
  const ttlMs = Math.max(0, (expires_in ?? 5184000) * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: { appId, appSecret },
  }
}

/**
 * Refresh Facebook credentials by exchanging the current long-lived token.
 *
 * Facebook allows exchanging a still-valid long-lived token for a new one
 * via the same fb_exchange_token grant.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const appId = credentials.extra?.['appId'] as string | undefined
  const appSecret = credentials.extra?.['appSecret'] as string | undefined
  const currentToken = credentials.accessToken
  if (!appId || !appSecret || !currentToken) {
    throw new Error(
      'Facebook refreshCredentials requires accessToken plus appId and appSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }

  const res = await axios.get<FacebookTokenResponse>(`${GRAPH_API_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    },
    timeout: 30_000,
  })

  const { access_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('Facebook token refresh returned an empty access_token')
  }

  const ttlMs = Math.max(0, (expires_in ?? 5184000) * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: access_token,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
