/**
 * Drupal Commerce auth helpers.
 *
 * Drupal Commerce does NOT use the OAuth2 authorization-code flow in the
 * traditional sense. Credentials are either:
 *
 *  1. A static Drupal user token (obtained via `/user/login` endpoint).
 *  2. An OAuth2 Bearer token from the `simple_oauth` module using the
 *     `password` or `client_credentials` grant.
 *
 * In both cases, credentials are configured directly via `/v1/connections`
 * rather than through a browser redirect flow. This adapter:
 *
 *  - Throws from `getAuthUrl` / `exchangeCode` with clear instructions.
 *  - Supports token refresh via `simple_oauth` refresh_token grant if
 *    `credentials.extra.refreshToken` is present.
 *  - Falls through gracefully for static tokens (returns credentials as-is).
 *
 * Docs: https://www.drupal.org/project/simple_oauth
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_PATH, TOKEN_LIFETIME_SECONDS } from './constants'

export function buildAuthUrl(baseUrl: string): string {
  // Informational redirect — not a functional OAuth authorize URL.
  return `${baseUrl.replace(/\/$/, '')}/admin/config/services/consumer`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Drupal Commerce uses bearer token auth — no authorization code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "drupal-commerce", credentials: {accessToken, extra: {baseUrl, clientId, clientSecret}}}`.',
  )
}

/**
 * Refresh a token using the simple_oauth `refresh_token` grant.
 * If no refreshToken is stored in extras, returns the existing credentials
 * unchanged (static-token mode).
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
  const refreshToken = credentials.extra?.['refreshToken'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  // Static token mode — no refresh needed.
  if (!refreshToken || !baseUrl) {
    return credentials
  }

  const url = `${baseUrl.replace(/\/$/, '')}${TOKEN_PATH}`
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    ...(clientId ? { client_id: clientId } : {}),
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  })

  const res = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
  }>(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30_000,
  })

  if (!res.data.access_token) {
    throw new Error('Drupal Commerce token endpoint returned an empty access_token')
  }

  const expiresIn = res.data.expires_in ?? TOKEN_LIFETIME_SECONDS
  return {
    ...credentials,
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: {
      ...credentials.extra,
      ...(res.data.refresh_token ? { refreshToken: res.data.refresh_token } : {}),
    },
  }
}
