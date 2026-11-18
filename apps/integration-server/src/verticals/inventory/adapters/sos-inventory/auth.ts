/**
 * SOS Inventory auth — OAuth 2.0 authorization-code flow.
 *
 * Customers register an application at developer.sosinventory.com to obtain
 * a clientId and clientSecret.  The adapter then drives the standard
 * authorization-code exchange against:
 *   Authorization: https://api.sosinventory.com/oauth2/authorize
 *   Token:         https://api.sosinventory.com/oauth2/token
 *
 * Tokens are short-lived; refreshCredentials re-runs the refresh_token grant.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { basicAuth, parseTokenResponse } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, SCOPES } from './constants'

export function credentialFields(): CredentialField[] {
  return [
    { name: 'clientId', label: 'Client ID', type: 'text', required: true },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
  ]
}

export function getAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = SCOPES,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  return { ...creds, extra: { clientId, clientSecret } }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return { ...creds, extra: { clientId, clientSecret } }
}
