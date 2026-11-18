/**
 * HelpDesk (by LiveChat) OAuth 2.0 Authorization Code Grant.
 *
 * The HelpDesk API shares the LiveChat Accounts authorization system.
 * Authorize URL: https://accounts.livechat.com/
 * Token URL:     https://accounts.livechat.com/v2/token
 *
 * Access tokens expire (expires_in seconds); use refresh_token to renew.
 * Docs: https://platform.text.com/docs/authorization/authorizing-api-calls/
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, DEFAULT_SCOPES } from './constants'

export function credentialFields(): CredentialField[] {
  // No extra tenant-specific fields needed — HelpDesk uses global OAuth
  return []
}

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
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
  account_id?: string
  organization_id?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    },
    { headers: { 'Content-Type': 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    extra: {
      accountId: data.account_id ?? '',
      organizationId: data.organization_id ?? '',
      expiresIn: String(data.expires_in ?? ''),
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    { headers: { 'Content-Type': 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    scope: data.scope ?? credentials.scope,
    extra: {
      ...credentials.extra,
      accountId: data.account_id ?? credentials.extra?.['accountId'] ?? '',
      organizationId: data.organization_id ?? credentials.extra?.['organizationId'] ?? '',
      expiresIn: String(data.expires_in ?? ''),
    },
  }
}

export { DEFAULT_SCOPES }
