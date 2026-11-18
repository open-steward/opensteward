/**
 * JOOR auth helpers.
 *
 * JOOR does NOT use the OAuth2 Authorization Code flow. Instead, it uses the
 * Resource Owner Password Credentials grant:
 *
 *   POST https://atlas.jooraccess.com/auth/
 *   Content-Type: multipart/form-data
 *   Fields: client_id, client_secret, grant_type=password, username, password
 *
 * The response contains an `access_token` (Bearer) and a `refresh_token`.
 * Tokens expire; use the refresh flow before they do.
 *
 * `getAuthUrl` and `exchangeCode` both throw — callers must POST credentials
 * directly via `POST /v1/connections` with:
 *   { platform: 'joor', credentials: { accessToken, extra: { refreshToken,
 *     expiresAt, clientId, clientSecret, username, password, accountId } } }
 *
 * Docs: https://api-docs.jooraccess.com/reference/generate-auth-bearer-token.md
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  AUTH_URL,
  AUTH_URL_SANDBOX,
  GRANT_TYPE_PASSWORD,
  GRANT_TYPE_REFRESH,
} from './constants'

interface JoorTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  refresh_expires_in?: number
  scope?: string
  session_state?: string
}

/**
 * Obtain a new JOOR Bearer token via the password-grant flow.
 * `sandbox` defaults to false (production).
 */
export async function obtainToken(opts: {
  clientId: string
  clientSecret: string
  username: string
  password: string
  sandbox?: boolean
}): Promise<Credentials> {
  const authUrl = opts.sandbox ? AUTH_URL_SANDBOX : AUTH_URL
  const form = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: GRANT_TYPE_PASSWORD,
    username: opts.username,
    password: opts.password,
  })

  const { data } = await axios.post<JoorTokenResponse>(authUrl, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  return {
    accessToken: data.access_token,
    expiresAt,
    extra: {
      refreshToken: data.refresh_token,
      refreshExpiresIn: data.refresh_expires_in,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      username: opts.username,
      password: opts.password,
      sandbox: opts.sandbox ?? false,
    },
  }
}

/**
 * Refresh an existing JOOR access token using the stored `refresh_token`.
 * Falls back to a full password grant if the refresh token is missing.
 */
export async function refreshToken(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = extra['clientId'] as string | undefined
  const clientSecret = extra['clientSecret'] as string | undefined
  const sandbox = Boolean(extra['sandbox'])
  const authUrl = sandbox ? AUTH_URL_SANDBOX : AUTH_URL
  const storedRefresh = extra['refreshToken'] as string | undefined

  if (!clientId || !clientSecret) {
    // Cannot refresh without client credentials — return as-is and let the
    // caller surface the auth error.
    return credentials
  }

  if (storedRefresh) {
    try {
      const form = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: GRANT_TYPE_REFRESH,
        refresh_token: storedRefresh,
      })
      const { data } = await axios.post<JoorTokenResponse>(authUrl, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const expiresAt = new Date(Date.now() + data.expires_in * 1000)
      return {
        accessToken: data.access_token,
        expiresAt,
        extra: {
          ...extra,
          refreshToken: data.refresh_token,
          refreshExpiresIn: data.refresh_expires_in,
        },
      }
    } catch {
      // Refresh token may be expired — fall through to password grant.
    }
  }

  // Password-grant fallback
  const username = extra['username'] as string | undefined
  const password = extra['password'] as string | undefined
  if (!username || !password) return credentials

  return obtainToken({ clientId, clientSecret, username, password, sandbox })
}

/** Informational — JOOR has no browser-based OAuth2 authorize step. */
export function buildAuthUrl(): string {
  return 'https://api-docs.jooraccess.com/reference/generate-auth-bearer-token'
}

/** Not applicable — JOOR uses password-grant, not Authorization Code. */
export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'JOOR does not use OAuth2 Authorization Code exchange. ' +
      'Call obtainToken() with your JOOR client_id, client_secret, username, and password, ' +
      'then POST the resulting credentials to /v1/connections with ' +
      '`{ platform: "joor", credentials: { accessToken, extra: { refreshToken, clientId, clientSecret, username, password, accountId } } }`.',
  )
}
