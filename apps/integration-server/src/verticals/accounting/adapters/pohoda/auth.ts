import axios from 'axios'
import { POHODA_AUTH_URL, POHODA_TOKEN_URL, POHODA_TOKEN_SCOPE } from './constants'
import type { Credentials } from '../../adapter/interface'
import { parseTokenResponse } from '@opensteward/shared'

// mPohoda uses OAuth2 Authorization Code flow via the ucet.pohoda.cz Identity Server.
// Tokens expire after 3600 s and cannot be refreshed — a new token must be obtained.

export function buildAuthUrl(clientId: string, redirectUri: string, scopes: string[], state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.length ? scopes.join(' ') : POHODA_TOKEN_SCOPE,
    state,
  })
  return `${POHODA_AUTH_URL}?${params.toString()}`
}


export async function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    POHODA_TOKEN_URL,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, scope: POHODA_TOKEN_SCOPE }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(clientId: string, clientSecret: string): Promise<Credentials> {
  // mPohoda tokens cannot be refreshed — request a new client_credentials token
  const { data } = await axios.post<Record<string, unknown>>(
    POHODA_TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: POHODA_TOKEN_SCOPE }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return parseTokenResponse(data)
}
