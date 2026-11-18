import axios from 'axios'
import { QUIPU_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { parseTokenResponse } from '@opensteward/shared'

// Quipu uses OAuth2 client credentials / authorization code flow.
// Token endpoint: POST https://getquipu.com/oauth/token
// All requests require: Accept: application/vnd.quipu.v1+json

export function buildAuthUrl(_state: string): string {
  return 'https://getquipu.com/settings/api'
}


export async function exchangeCode(
  code: string,
  clientId = '',
  clientSecret = '',
  redirectUri = '',
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    QUIPU_TOKEN_URL,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/vnd.quipu.v1+json' } },
  )
  return parseTokenResponse(data)
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<Record<string, unknown>>(
    QUIPU_TOKEN_URL,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/vnd.quipu.v1+json' } },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = credentials.refreshToken
  return creds
}
