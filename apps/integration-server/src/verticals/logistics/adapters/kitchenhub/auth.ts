/**
 * KitchenHub authentication.
 *
 * The Auth API (https://kitchenhub.readme.io/reference/auth-api.md): "Request
 * an access token using your `client_id` and `client_secret`", "Use the
 * `access_token` in the `Authorization` header of each API request", and
 * "Refresh the `access_token` when it expires using the `refresh_token`".
 *
 *   POST /v2/auth/token/          { client_id, client_secret }
 *     -> { access_token, refresh_token, access_token_expire, refresh_token_expire }
 *   POST /v2/auth/token/refresh/  { refresh_token }
 *     -> { access_token, access_token_expire, refresh_token }
 *
 * Both expiries are "in minutes". "You must store the new `refresh_token`
 * after each refresh, as the old one becomes invalid."
 *
 * There is no static API key and no authorize page, so the connection form
 * collects the client id and secret, and they are kept in `extra` so an
 * expired refresh token can be replaced by a fresh pair without re-prompting.
 */

import type { CredentialField } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { KITCHENHUB_TOKEN_URL, KITCHENHUB_REFRESH_TOKEN_URL } from './constants'

/** ObtainTokenResponseSerializer / RefreshTokenResponseSerializer. */
interface KitchenHubTokenResponse {
  access_token: string
  refresh_token?: string
  /** "Access token expire time in minutes". */
  access_token_expire?: number
}

export const KITCHENHUB_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'The client_id KitchenHub issued for your account.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
    helpText: 'The client_secret KitchenHub issued for your account.',
  },
]

async function postTokens(
  url: string,
  body: Record<string, string>,
): Promise<KitchenHubTokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(new Error(`KitchenHub token request failed (${res.status}): ${text}`), {
      statusCode: res.status,
    })
  }
  return (await res.json()) as KitchenHubTokenResponse
}

function expiry(minutes: number | undefined): Date | undefined {
  return typeof minutes === 'number' ? new Date(Date.now() + minutes * 60_000) : undefined
}

/** POST /v2/auth/token/ with the client id and secret. */
export async function obtainTokens(clientId: string, clientSecret: string): Promise<Credentials> {
  const json = await postTokens(KITCHENHUB_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
  })
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiry(json.access_token_expire),
    extra: { clientId, clientSecret },
  }
}

/** Connect Link: exchange the submitted client id and secret for a token pair. */
export async function exchangeClientCredentials(
  input: Record<string, string>,
): Promise<Credentials> {
  const clientId = (input?.['clientId'] ?? '').trim()
  const clientSecret = (input?.['clientSecret'] ?? '').trim()
  if (!clientId || !clientSecret)
    throw new Error('KitchenHub: Client ID and client secret are required.')
  return obtainTokens(clientId, clientSecret)
}

function clientCredentials(
  credentials: Credentials,
): { clientId: string; clientSecret: string } | undefined {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra['clientId']
  const clientSecret = extra['clientSecret']
  return typeof clientId === 'string' &&
    clientId &&
    typeof clientSecret === 'string' &&
    clientSecret
    ? { clientId, clientSecret }
    : undefined
}

/**
 * POST /v2/auth/token/refresh/ with the stored refresh token. When there is
 * none, or the refresh token has itself expired (it has its own
 * `refresh_token_expire`), a new pair is created from the stored client id
 * and secret.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const client = clientCredentials(credentials)
  const refreshToken = credentials.refreshToken
  if (refreshToken) {
    try {
      const json = await postTokens(KITCHENHUB_REFRESH_TOKEN_URL, { refresh_token: refreshToken })
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? refreshToken,
        expiresAt: expiry(json.access_token_expire),
        extra: credentials.extra,
      }
    } catch (err) {
      if (!client) throw err
    }
  }
  if (!client) {
    throw new Error(
      'KitchenHub: cannot refresh credentials: no refresh token and no client id/secret stored',
    )
  }
  return obtainTokens(client.clientId, client.clientSecret)
}
