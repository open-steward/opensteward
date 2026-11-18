/**
 * Vincere OAuth2 helpers.
 *
 * Vincere Identity (id.vincere.io) implements the standard Authorization Code
 * grant. On token exchange the server returns:
 *   access_token, refresh_token (first issuance only), id_token, expires_in
 *
 * The id_token (a JWT) must be passed as `id-token` on every REST v2 request.
 * We store it in credentials.extra.idToken so the client can read it.
 */

import type { Credentials } from '@opensteward/shared'
import {
  VINCERE_AUTH_URL,
  VINCERE_TOKEN_URL,
  DEFAULT_VINCERE_SCOPES,
} from './constants'

export interface VincereOAuthConfig {
  clientId: string
  redirectUri: string
  /** OAuth scopes to request. Defaults to DEFAULT_VINCERE_SCOPES when omitted. */
  scopes?: string[]
}

export function buildAuthUrl(config: VincereOAuthConfig, state: string): string {
  const url = new URL(VINCERE_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_VINCERE_SCOPES).join(' '))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

interface VincereTokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  token_type?: string
}

function credentialsFromTokenResponse(
  json: VincereTokenResponse,
  previous?: Credentials,
): Credentials {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? previous?.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: {
      ...(previous?.extra as Record<string, unknown> | undefined),
      idToken: json.id_token ?? (previous?.extra as Record<string, unknown> | undefined)?.['idToken'],
    },
  }
}

export async function exchangeCode(
  config: VincereOAuthConfig,
  code: string,
): Promise<Credentials> {
  const res = await fetch(VINCERE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Vincere token exchange failed: ${text}`)
  }

  const json = await res.json() as VincereTokenResponse
  return credentialsFromTokenResponse(json)
}

export async function refreshToken(
  config: Pick<VincereOAuthConfig, 'clientId'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const res = await fetch(VINCERE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: credentials.refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Vincere token refresh failed: ${text}`)
  }

  const json = await res.json() as VincereTokenResponse
  return credentialsFromTokenResponse(json, credentials)
}
