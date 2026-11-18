/**
 * Tiendanube / Nuvemshop OAuth2 helpers.
 *
 * The flow uses a standard Authorization Code grant. Tokens are long-lived
 * (they do not expire on a schedule; they are only invalidated when a new
 * token is obtained or the user uninstalls the app). `refreshCredentials`
 * is therefore a no-op.
 *
 * The `user_id` returned in the token response is the store's numeric ID —
 * it must be stored alongside the access_token so every subsequent API call
 * can be directed to `/{version}/{store_id}/resource`.
 *
 * Docs: https://tiendanube.github.io/api-documentation/authentication
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL_ES, BASE_URL_BR, API_VERSION, OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export type TiendanubeRegion = 'es' | 'br'

/** Build the versioned per-store base URL for REST API calls. */
export function buildApiBaseUrl(storeId: string, region: TiendanubeRegion = 'es'): string {
  const host = region === 'br' ? BASE_URL_BR : BASE_URL_ES
  return `${host}/${API_VERSION}/${storeId}`
}

export function buildAuthUrl(
  appId: string,
  scopes: string[],
  state: string,
): string {
  const base = OAUTH_AUTHORIZE_URL.replace('{app_id}', appId)
  const params = new URLSearchParams({
    scope: scopes.join(','),
    state,
  })
  return `${base}?${params.toString()}`
}

interface TiendanubeTokenResponse {
  access_token: string
  token_type: string
  scope?: string
  /** The store's numeric ID — required as a path segment on every API call. */
  user_id: string | number
}

/** Credentials extended with Tiendanube-specific storeId. */
export interface TiendanubeCredentials extends Credentials {
  /** Numeric store ID returned by the OAuth token endpoint. */
  storeId: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<TiendanubeCredentials> {
  const { data } = await axios.post<TiendanubeTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  // Tokens do not expire — no expiresAt.
  return {
    accessToken: data.access_token,
    scope: data.scope,
    storeId: String(data.user_id),
  }
}
