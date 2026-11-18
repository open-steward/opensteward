/**
 * Orckestra OAuth2 helpers.
 *
 * Orckestra is a server-to-server B2B platform. There is no user-facing
 * browser redirect or authorization code flow. Credentials are provisioned
 * out-of-band (clientId + clientSecret configured in the Orckestra dashboard)
 * and exchanged for a Bearer token via the client_credentials grant.
 *
 * `getAuthUrl` and `exchangeCode` both throw — callers should POST credentials
 * directly to `/v1/connections` as `credentials.extra`.
 *
 * `refreshCredentials` tries a refresh_token grant first; if no refresh token
 * is available (or the grant fails), it falls back to client_credentials.
 *
 * Token URL: `https://{instance}.orckestra.cloud/oauth/token`
 * Credentials shape stored in `extra`:
 *   { clientId, clientSecret, baseUrl }
 * where `baseUrl` = `https://{instance}.orckestra.cloud/api`
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_BUFFER_MS, TOKEN_PATH } from './constants'

interface OrckestraTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

/** Derive the OAuth2 token URL from the API base URL in credentials.extra. */
function resolveTokenUrl(extra: Record<string, unknown>): string {
  const baseUrl = extra['baseUrl'] as string | undefined
  if (!baseUrl) {
    throw new Error(
      'orckestra: credentials.extra.baseUrl is required ' +
        '(e.g. https://{instance}.orckestra.cloud/api)',
    )
  }
  // Strip /api suffix and append /oauth/token
  const instanceRoot = baseUrl.replace(/\/api\/?$/, '')
  return `${instanceRoot}${TOKEN_PATH}`
}

/**
 * Orckestra has no browser-redirect authorization URL.
 * This method always throws — configure credentials via POST /v1/connections.
 */
export function getAuthUrl(_state: string): never {
  throw new Error(
    'orckestra: getAuthUrl is not supported. ' +
      'Orckestra uses a server-to-server OAuth2 client_credentials grant. ' +
      'POST your clientId, clientSecret, and baseUrl to /v1/connections instead.',
  )
}

/**
 * Code exchange is not applicable to Orckestra.
 * This method always throws — there is no OAuth2 authorization code flow.
 */
export async function exchangeCode(_code: string, _redirectUri: string): Promise<never> {
  throw new Error(
    'orckestra: exchangeCode is not supported. ' +
      'Orckestra uses a server-to-server OAuth2 client_credentials grant. ' +
      'POST your clientId, clientSecret, and baseUrl to /v1/connections instead.',
  )
}

/**
 * Request a fresh Bearer token from Orckestra using client_credentials.
 * Embeds clientId/clientSecret/baseUrl in `credentials.extra` so future
 * refresh calls work without additional user input.
 */
export async function requestClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  baseUrl: string,
  scope?: string,
): Promise<Credentials> {
  const tokenUrl = resolveTokenUrl({ baseUrl })
  const params = new URLSearchParams()
  params.set('grant_type', 'client_credentials')
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)
  if (scope) params.set('scope', scope)

  const { data } = await axios.post<OrckestraTokenResponse>(
    tokenUrl,
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope,
    extra: { clientId, clientSecret, baseUrl },
  }
}

/**
 * Attempt a refresh_token grant. Returns `null` if no refresh token is
 * available or if the server rejects the refresh (so the caller can fall
 * back to client_credentials).
 */
async function tryRefreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  baseUrl: string,
): Promise<Credentials | null> {
  const tokenUrl = resolveTokenUrl({ baseUrl })
  const params = new URLSearchParams()
  params.set('grant_type', 'refresh_token')
  params.set('refresh_token', refreshToken)
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)

  try {
    const { data } = await axios.post<OrckestraTokenResponse>(
      tokenUrl,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      },
    )
    const expiresAt = new Date(Date.now() + data.expires_in * 1000 - TOKEN_BUFFER_MS)
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt,
      scope: data.scope,
      extra: { clientId, clientSecret, baseUrl },
    }
  } catch {
    return null
  }
}

/**
 * Refresh Orckestra credentials.
 *
 * Strategy:
 *  1. If `credentials.refreshToken` is present, attempt a refresh_token grant.
 *  2. If that fails (or no refresh token), fall back to client_credentials.
 *
 * `clientId`, `clientSecret`, and `baseUrl` must be present in
 * `credentials.extra`.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = extra['clientId'] as string | undefined
  const clientSecret = extra['clientSecret'] as string | undefined
  const baseUrl = extra['baseUrl'] as string | undefined

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error(
      'orckestra refreshCredentials: credentials.extra must contain ' +
        'clientId, clientSecret, and baseUrl.',
    )
  }

  // 1. Try refresh_token grant
  if (credentials.refreshToken) {
    const refreshed = await tryRefreshToken(
      credentials.refreshToken,
      clientId,
      clientSecret,
      baseUrl,
    )
    if (refreshed) return refreshed
  }

  // 2. Fall back to client_credentials
  return requestClientCredentialsToken(clientId, clientSecret, baseUrl, credentials.scope)
}
