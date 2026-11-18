/**
 * Scopevisio authentication helpers.
 *
 * Scopevisio uses bearer tokens obtained via its own /token endpoint.
 * For the api_key model the caller supplies the bearer token directly;
 * it is stored as `credentials.accessToken` and sent as
 * `Authorization: Bearer <token>`.
 *
 * The token endpoint also supports grant_type=refresh_token when a refreshToken
 * is present.  Tokens are long-lived (days) but we honour expires_in when
 * present.
 *
 * Docs: https://appload.scopevisio.com/static/swagger/index.html
 */

import axios from 'axios'
import { SCOPEVISIO_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

/** No-op auth URL — Scopevisio uses a direct bearer-token / api_key flow. */
export function getAuthUrl(_state: string): string {
  return '#'
}

/**
 * Exchange an api_key (bearer token) supplied by the user.
 * For the simple api_key flow `code` is the raw bearer token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code.trim() }
}

/**
 * Refresh an existing token using the Scopevisio token endpoint.
 * If no refresh token is available the existing credentials are returned as-is
 * (bearer tokens are long-lived).
 */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })

  const { data } = await axios.post<{
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }>(SCOPEVISIO_TOKEN_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : credentials.expiresAt

  return {
    accessToken: data.access_token ?? credentials.accessToken,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt,
  }
}
