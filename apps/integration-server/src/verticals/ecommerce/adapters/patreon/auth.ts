/**
 * Patreon auth — OAuth2 authorization code flow.
 *
 * Patreon issues tokens via `POST https://www.patreon.com/api/oauth2/token`.
 * The access_token is a long-lived token (~31 days) with a refresh_token.
 *
 * Required scopes for this adapter:
 *   - identity (read user/campaign info)
 *   - campaigns (read campaigns)
 *   - campaigns.members (read members/pledges)
 *
 * Credentials shape:
 *   { accessToken, refreshToken, expiresAt, extra: { clientId, clientSecret } }
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL, TOKEN_URL, TOKEN_LIFETIME_SECONDS } from './constants'

export const DEFAULT_PATREON_SCOPES: readonly string[] = [
  'identity',
  'identity[email]',
  'campaigns',
  'campaigns.members',
  'campaigns.members[email]',
  'campaigns.members.address',
]

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes?: string[],
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: (scopes ?? DEFAULT_PATREON_SCOPES).join(' '),
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const res = await axios.post<{
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )
  if (!res.data.access_token) {
    throw new Error('Patreon token endpoint returned an empty access_token')
  }
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresAt: new Date(Date.now() + (res.data.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000),
    extra: { clientId, clientSecret },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!clientId || !clientSecret) {
    throw new Error(
      'Patreon refreshCredentials requires clientId and clientSecret in credentials.extra.',
    )
  }
  if (!refreshToken) {
    throw new Error(
      'Patreon refreshCredentials requires a refreshToken.',
    )
  }

  const res = await axios.post<{
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )
  if (!res.data.access_token) {
    throw new Error('Patreon token refresh returned an empty access_token')
  }
  return {
    ...credentials,
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (res.data.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000),
  }
}
