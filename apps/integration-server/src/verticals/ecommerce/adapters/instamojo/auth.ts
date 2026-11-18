/**
 * Instamojo OAuth2 helpers.
 *
 * Instamojo uses the Authorization Code grant flow. The authorize and token
 * endpoints differ between sandbox and production:
 *
 *   Production:
 *     Authorize: https://www.instamojo.com/oauth2/authorize/
 *     Token:     https://www.instamojo.com/oauth2/token/
 *     API:       https://api.instamojo.com/v2/
 *
 *   Sandbox:
 *     Authorize: https://test.instamojo.com/oauth2/authorize/
 *     Token:     https://test.instamojo.com/oauth2/token/
 *     API:       https://test.instamojo.com/v2/
 *
 * Access tokens expire after 10 hours. Use the refresh_token grant to obtain
 * a new access token without re-prompting the user.
 *
 * Docs: https://docs.instamojo.com/v2-mdp/reference/authentication-flow
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  PROD_AUTH_URL,
  PROD_TOKEN_URL,
  SANDBOX_AUTH_URL,
  SANDBOX_TOKEN_URL,
  DEFAULT_SCOPES,
} from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  sandbox = false,
): string {
  const base = sandbox ? SANDBOX_AUTH_URL : PROD_AUTH_URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${base}?${params.toString()}`
}

interface InstamojoTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  sandbox = false,
): Promise<Credentials> {
  const tokenUrl = sandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  })

  const { data } = await axios.post<InstamojoTokenResponse>(tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })

  const expiresAt =
    typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope,
    extra: {
      clientId,
      clientSecret,
      sandbox,
    },
  }
}

export async function refreshToken(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const sandbox = (credentials.extra?.['sandbox'] as boolean | undefined) ?? false
  const tokenUrl = sandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL

  if (!credentials.refreshToken || !clientId || !clientSecret) {
    // Cannot refresh — return unchanged and let the caller re-authorize.
    return credentials
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  try {
    const { data } = await axios.post<InstamojoTokenResponse>(tokenUrl, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    })

    const expiresAt =
      typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : undefined

    return {
      ...credentials,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? credentials.refreshToken,
      expiresAt,
      scope: data.scope ?? credentials.scope,
    }
  } catch {
    return credentials
  }
}

export { DEFAULT_SCOPES }
