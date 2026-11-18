/**
 * Medius AP Automation – OAuth2 authentication helpers.
 *
 * Flow: authorization-code (standard OAuth2).
 * Authorize: https://login.medius.com/{tenant}/oauth/authorize
 * Token:     https://login.medius.com/{tenant}/connect/token
 *
 * The tenant slug (e.g. "acme") is stored in credentials.tenantId and
 * required for both the token endpoint and every API call.
 *
 * Docs: https://success.medius.com/documentation/integration-documentation/
 */

import axios from 'axios'
import { mediusAuthUrl, mediusTokenUrl, MEDIUS_DEFAULT_SCOPES } from './constants'
import type { Credentials } from '../../adapter/interface'
import { basicAuth, parseTokenResponse } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  tenant: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: (scopes.length ? scopes : MEDIUS_DEFAULT_SCOPES).join(' '),
    state,
  })
  return `${mediusAuthUrl(tenant)}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  tenant: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    mediusTokenUrl(tenant),
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  creds.tenantId = tenant
  return creds
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  tenant: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    mediusTokenUrl(tenant),
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
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
  creds.tenantId = tenant
  return creds
}
