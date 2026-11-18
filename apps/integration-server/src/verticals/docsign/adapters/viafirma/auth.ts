/**
 * Viafirma OAuth2 helpers.
 *
 * Viafirma Documents delegates authentication to the Viafirma Fortress
 * OAuth2 server. The Authorization-Code grant is used for interactive
 * onboarding; the access token is then presented as a Bearer token on
 * every Documents API request. Fortress co-hosts the authorize endpoint at
 * `{fortress}/oauth2/v1/auth` and the token endpoint at
 * `{fortress}/fortress/oauth2/v1/token`.
 *
 * Which Fortress (and which Documents host) is a property of the deployment's
 * OAuth client registration — production or sandbox — not of the customer, so
 * the adapter resolves both from config and stores them on `credentials.extra`
 * for the refresh flow and the API client.
 *
 * Docs: https://doc.viafirma.com/viafirma-fortress/integration/latest/en/auth/
 *       https://doc.viafirma.com/documents/api/latest/en/security.html
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_FORTRESS_URL } from './constants'

function authorizeUrl(fortressUrl: string): string {
  return `${fortressUrl}/oauth2/v1/auth`
}

function tokenUrl(fortressUrl: string): string {
  return `${fortressUrl}/fortress/oauth2/v1/token`
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  fortressUrl: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
  })
  return `${authorizeUrl(fortressUrl)}?${params.toString()}`
}

interface ViafirmaTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: 'Bearer'
  /** Null for batch/long-lived tokens; seconds otherwise. */
  expires_in?: number | null
  /** Returned on the authorization_code grant — identifies the Documents user. */
  user_code?: string
}

function tokenExpiry(expiresIn: number | null | undefined): Date | undefined {
  if (typeof expiresIn !== 'number' || Number.isNaN(expiresIn)) return undefined
  return new Date(Date.now() + expiresIn * 1000)
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  fortressUrl: string,
  baseUrl: string,
): Promise<Credentials> {
  const { data } = await axios.post<ViafirmaTokenResponse>(
    tokenUrl(fortressUrl),
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
    expiresAt: tokenExpiry(data.expires_in),
    extra: {
      userCode: data.user_code,
      fortressUrl,
      baseUrl,
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  // Connections stored before the Fortress URL was recorded were all authorised on the sandbox.
  const fortressUrl = String(credentials.extra?.['fortressUrl'] ?? DEFAULT_FORTRESS_URL)
  const { data } = await axios.post<ViafirmaTokenResponse>(
    tokenUrl(fortressUrl),
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
    expiresAt: tokenExpiry(data.expires_in),
    extra: credentials.extra ?? {},
  }
}
