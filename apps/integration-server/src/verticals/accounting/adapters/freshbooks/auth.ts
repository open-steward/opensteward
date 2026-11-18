import axios from 'axios'
import { FRESHBOOKS_AUTH_URL, FRESHBOOKS_TOKEN_URL } from './constants'
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
    state,
  })
  if (scopes.length) params.set('scope', scopes.join(' '))
  return `${FRESHBOOKS_AUTH_URL}?${params.toString()}`
}


export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    FRESHBOOKS_TOKEN_URL,
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret },
    { headers: { 'Content-Type': 'application/json' } },
  )
  const creds = parseTokenResponse(data)
  // Fetch account id. This is not best-effort: FreshBooks interpolates the account id
  // into every request path (`accounting/account/<id>/...`), so a credential without
  // one yields `accounting/account//...` on every call. Letting the lookup failure
  // through here surfaces it at connect time, where the operator can act on it,
  // instead of storing a connection that looks healthy and works for nothing.
  const me = await axios.get<{ response: { id: string; account_id?: string; business_memberships?: Array<{ business: { account_id: string } }> } }>(
    'https://api.freshbooks.com/auth/api/v1/users/me',
    { headers: { Authorization: `Bearer ${creds.accessToken}` } },
  )
  const accountId =
    me.data.response.business_memberships?.[0]?.business?.account_id ??
    me.data.response.account_id
  if (accountId) creds.tenantId = accountId
  return creds
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    FRESHBOOKS_TOKEN_URL,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret },
    { headers: { 'Content-Type': 'application/json' } },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
