/**
 * DocuSign OAuth helpers.
 *
 * Authorization-Code Grant only (the JWT Grant lives in the JWT auth path
 * and is wired separately through Connect Link's credential-form flow).
 *
 * Docs: https://developers.docusign.com/platform/auth/authcode/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  OAUTH_USERINFO_URL,
} from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface DocuSignTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: 'Bearer'
  expires_in: number
}

interface DocuSignUserInfo {
  sub: string
  accounts: Array<{
    account_id: string
    is_default: boolean
    account_name: string
    base_uri: string
  }>
}

async function fetchUserInfo(accessToken: string): Promise<DocuSignUserInfo> {
  const { data } = await axios.get<DocuSignUserInfo>(OAUTH_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return data
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<DocuSignTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
    },
  )

  const userInfo = await fetchUserInfo(data.access_token)
  const defaultAccount = userInfo.accounts.find((a) => a.is_default) ?? userInfo.accounts[0]

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: {
      accountId: defaultAccount?.account_id,
      accountName: defaultAccount?.account_name,
      baseUri: defaultAccount?.base_uri,
      userId: userInfo.sub,
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<DocuSignTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
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
