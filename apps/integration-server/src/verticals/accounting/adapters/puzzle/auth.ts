/**
 * Puzzle OAuth 2.0 + PKCE authentication helpers.
 *
 * Auth URL:   https://api.puzzle.io/rest/v0/oauth/authorize
 * Token URL:  https://api.puzzle.io/rest/v0/oauth/token
 *
 * Puzzle uses the Authorization Code flow with optional PKCE (S256).
 * Access tokens are passed as Bearer tokens in subsequent API calls.
 */

import axios from 'axios'
import { PUZZLE_AUTH_URL, PUZZLE_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${PUZZLE_AUTH_URL}?${params.toString()}`
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: data['expires_in']
      ? new Date(Date.now() + (data['expires_in'] as number) * 1000)
      : undefined,
    scope: data['scope'] as string | undefined,
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const { data } = await axios.post<Record<string, unknown>>(PUZZLE_TOKEN_URL, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const { data } = await axios.post<Record<string, unknown>>(PUZZLE_TOKEN_URL, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
