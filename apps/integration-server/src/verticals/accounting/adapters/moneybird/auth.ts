import axios from 'axios'
import { MONEYBIRD_AUTH_URL, MONEYBIRD_TOKEN_URL } from './constants'
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
  return `${MONEYBIRD_AUTH_URL}?${params.toString()}`
}


export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    MONEYBIRD_TOKEN_URL,
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret },
    { headers: { 'Content-Type': 'application/json' } },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    MONEYBIRD_TOKEN_URL,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret },
    { headers: { 'Content-Type': 'application/json' } },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
