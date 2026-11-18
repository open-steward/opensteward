/**
 * MRI Software OAuth2 authentication helpers.
 *
 * MRI is an enterprise platform with per-tenant OAuth2 endpoints.
 * The `instanceUrl` (e.g. https://acme.mrisoftware.com) is provided
 * by the customer and stored in `credentials.extra.instanceUrl`.
 */

import axios from 'axios'
import { MRI_AUTH_PATH, MRI_TOKEN_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'
import { basicAuth } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  instanceUrl: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${instanceUrl}${MRI_AUTH_PATH}?${params.toString()}`
}

function parseTokenResponse(
  data: Record<string, unknown>,
  instanceUrl: string,
): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
    scope: data['scope'] as string | undefined,
    extra: { instanceUrl },
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  instanceUrl: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    `${instanceUrl}${MRI_TOKEN_PATH}`,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return parseTokenResponse(data, instanceUrl)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  instanceUrl: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    `${instanceUrl}${MRI_TOKEN_PATH}`,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data, instanceUrl)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
