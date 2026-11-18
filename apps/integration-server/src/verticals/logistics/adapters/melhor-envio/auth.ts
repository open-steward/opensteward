import type { Credentials } from '../../adapter/interface'
import {
  MELHOR_ENVIO_OAUTH_AUTHORIZE_URL,
  MELHOR_ENVIO_OAUTH_TOKEN_URL,
  MELHOR_ENVIO_SANDBOX_AUTHORIZE_URL,
  MELHOR_ENVIO_SANDBOX_TOKEN_URL,
  MELHOR_ENVIO_SCOPES,
  ACCESS_TOKEN_TTL_MS,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

// ─── Internal token response shape ───────────────────────────────────────────

interface MelhorEnvioTokenResponse {
  token_type: string
  expires_in?: number
  access_token: string
  refresh_token?: string
  scope?: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface MelhorEnvioAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  sandbox?: boolean
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function authorizeUrl(sandbox: boolean): string {
  return sandbox ? MELHOR_ENVIO_SANDBOX_AUTHORIZE_URL : MELHOR_ENVIO_OAUTH_AUTHORIZE_URL
}

function tokenUrl(sandbox: boolean): string {
  return sandbox ? MELHOR_ENVIO_SANDBOX_TOKEN_URL : MELHOR_ENVIO_OAUTH_TOKEN_URL
}

// ─── Auth URL ─────────────────────────────────────────────────────────────────

/**
 * Build the OAuth2 authorization URL that redirects the user to the
 * Melhor Envio consent screen.
 */
export function buildAuthUrl(
  config: MelhorEnvioAuthConfig,
  state: string,
  overrideScopes?: string[],
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: (overrideScopes ?? MELHOR_ENVIO_SCOPES).join(' '),
    state,
  })
  return `${authorizeUrl(config.sandbox ?? false)}?${params.toString()}`
}

// ─── Code exchange ────────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for an access_token + refresh_token.
 * Melhor Envio access tokens are valid for 30 days; refresh tokens 45 days.
 */
export async function exchangeCode(
  code: string,
  config: MelhorEnvioAuthConfig,
): Promise<Credentials> {
  const body = JSON.stringify({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  })

  const res = await fetch(tokenUrl(config.sandbox ?? false), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'OpenSteward/1.0 (support@opensteward.dev)',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`melhor-envio: token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as MelhorEnvioTokenResponse
  const ttlMs = json.expires_in != null ? json.expires_in * 1000 : ACCESS_TOKEN_TTL_MS

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      sandbox: config.sandbox ?? false,
    },
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Obtain a new access_token using the stored refresh_token.
 * Falls back to a no-op return if no refresh_token is present
 * (e.g. adapter configured with a long-lived personal access token).
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) {
    return credentials
  }

  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = (extra.clientId as string | undefined) ?? ''
  const clientSecret = (extra.clientSecret as string | undefined) ?? ''
  const redirectUri = (extra.redirectUri as string | undefined) ?? ''
  const sandbox = (extra.sandbox as boolean | undefined) ?? false

  const body = JSON.stringify({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    refresh_token: credentials.refreshToken,
  })

  const res = await fetch(tokenUrl(sandbox), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'OpenSteward/1.0 (support@opensteward.dev)',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`melhor-envio: token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as MelhorEnvioTokenResponse
  const ttlMs = json.expires_in != null ? json.expires_in * 1000 : ACCESS_TOKEN_TTL_MS

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
    scope: json.scope ?? credentials.scope,
    extra: credentials.extra,
  }
}

// ─── Token expiry check ───────────────────────────────────────────────────────

/** Returns true when the token is within the refresh buffer window. */
export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  const expiresAtMs =
    credentials.expiresAt instanceof Date
      ? credentials.expiresAt.getTime()
      : Number(credentials.expiresAt)
  return expiresAtMs - Date.now() < TOKEN_REFRESH_BUFFER_MS
}
