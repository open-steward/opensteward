/**
 * PlentyONE OAuth2 / token helpers.
 *
 * PlentyONE does not use the standard OAuth2 authorization-code flow. Instead,
 * credentials (username + password) are exchanged directly for a Bearer token
 * via POST /rest/login. The response contains:
 *   - access_token  — JWT Bearer token (valid for expires_in seconds, typically 86 400)
 *   - refresh_token — used to extend the session without re-entering credentials
 *   - expires_in    — seconds until access_token expires
 *
 * Docs: https://developers.plentymarkets.com/en-gb/developers/main/rest-api-guides/getting-started.html
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_PATH } from './constants'

/** Build the REST base URL for a given PlentyONE system id. */
export function buildBaseUrl(plentyId: string | number): string {
  return `https://p${plentyId}.my.plentysystems.com${API_BASE_PATH}`
}

/**
 * PlentyONE does not have an OAuth2 authorize URL.
 * This returns an informational link to the REST API settings page.
 */
export function buildAuthUrl(plentyId: string): string {
  return `https://p${plentyId}.my.plentysystems.com/plenty/ui/system/settings`
}

interface PlentyOneLoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
}

/**
 * Exchange username + password for a PlentyONE Bearer token.
 *
 * `plentyId` is the numeric system identifier embedded in the base URL
 * (e.g. `54321` for `https://p54321.my.plentysystems.com`).
 */
export async function loginWithPassword(
  plentyId: string | number,
  username: string,
  password: string,
): Promise<Credentials> {
  const { data } = await axios.post<PlentyOneLoginResponse>(
    `${buildBaseUrl(plentyId)}/login`,
    { username, password },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1_000)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    extra: { plentyId: String(plentyId) },
  }
}

/**
 * Use the stored refresh_token to obtain a new access_token before the
 * current one expires.
 */
export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  const plentyId = credentials.extra?.['plentyId'] as string | undefined
  if (!plentyId) throw new Error('refreshAccessToken: credentials.extra.plentyId is required')
  if (!credentials.refreshToken) {
    throw new Error('refreshAccessToken: credentials.refreshToken is required')
  }

  const { data } = await axios.post<PlentyOneLoginResponse>(
    `${buildBaseUrl(plentyId)}/login/refresh`,
    {},
    {
      headers: {
        Authorization: `Bearer ${credentials.refreshToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1_000)
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt,
  }
}
