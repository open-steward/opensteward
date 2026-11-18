/**
 * pdfFiller OAuth helpers.
 *
 * Standard OAuth 2.0 Authorization-Code Grant. pdfFiller mints access +
 * refresh tokens at the v2 token endpoint; client credentials are sent in
 * the form body (not HTTP Basic).
 *
 * Docs: https://docs.pdffiller.com/ (Authentication)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

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
    state,
  })
  if (scopes.length > 0) params.set('scope', scopes.join(' '))
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface PdffillerTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<PdffillerTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: {},
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<PdffillerTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: credentials.extra ?? {},
  }
}
