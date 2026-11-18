/**
 * Digits Connect API — OAuth 2.0 authorization-code flow.
 * Docs: https://developer.digits.com/docs/authentication
 *
 * Token endpoint: POST https://connect.digits.com/v1/oauth/token
 *   The docs give both grants as a JSON body, "Request Headers:
 *   Content-Type: application/json", and the spec's requestBody offers only
 *   application/json (TokenRequest). The adapter used to post a form body.
 * Auth header:    Bearer <access_token>
 * Refresh tokens do not expire, but are revoked on app uninstall.
 */
import axios from 'axios'
import { DIGITS_AUTH_URL, DIGITS_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { parseTokenResponse } from '@opensteward/shared'

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
  return `${DIGITS_AUTH_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    DIGITS_TOKEN_URL,
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    DIGITS_TOKEN_URL,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  // Digits refresh tokens don't expire — preserve if not returned
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
