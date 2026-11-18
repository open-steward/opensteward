import type { Credentials } from '../../adapter/interface'
import {
  buildBaseUrl,
  TOKEN_PATH,
  WEBSHIPPER_DASHBOARD_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface WebshipperAuthConfig {
  /** Webshipper account slug (subdomain), e.g. "mycompany" */
  accountSlug: string
  /** OAuth2 client ID from the OAuth application */
  clientId: string
  /** OAuth2 client secret */
  clientSecret: string
}

export interface WebshipperPasswordConfig extends WebshipperAuthConfig {
  username: string
  password: string
}

/**
 * Redirect users to the Webshipper OAuth applications settings page.
 * Webshipper supports Authorization Code grant; for simplicity the
 * integration uses the dashboard URL and stores credentials via exchangeCode.
 */
export function buildAuthUrl(_state: string): string {
  return WEBSHIPPER_DASHBOARD_URL
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

async function fetchToken(
  accountSlug: string,
  body: URLSearchParams,
): Promise<Credentials> {
  const url = `${buildBaseUrl(accountSlug)}${TOKEN_PATH}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Webshipper token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as TokenResponse

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: { accountSlug },
  }
}

/**
 * Exchange OAuth2 Resource Owner Password Credentials for an access token.
 */
export async function exchangePasswordCredentials(
  config: WebshipperPasswordConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    username: config.username,
    password: config.password,
  })
  return fetchToken(config.accountSlug, body)
}

/**
 * Exchange an Authorization Code for tokens (Authorization Code grant).
 * `code` is expected to be a JSON-encoded string: { accountSlug, clientId, clientSecret, code, redirectUri }
 */
export async function exchangeCode(
  rawCode: string,
  redirectUri: string,
): Promise<Credentials> {
  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(rawCode) as Record<string, string>
  } catch {
    // Fallback: treat as "accountSlug:clientId:clientSecret:code"
    const parts = rawCode.split(':')
    parsed = {
      accountSlug: parts[0] ?? '',
      clientId: parts[1] ?? '',
      clientSecret: parts[2] ?? '',
      code: parts.slice(3).join(':'),
    }
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: parsed.clientId ?? '',
    client_secret: parsed.clientSecret ?? '',
    code: parsed.code ?? '',
    redirect_uri: redirectUri,
  })

  return fetchToken(parsed.accountSlug ?? '', body)
}

/**
 * Refresh an access token using the stored refresh_token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const accountSlug = extra.accountSlug as string | undefined

  if (!accountSlug) {
    throw new Error('Cannot refresh Webshipper credentials: missing accountSlug in extra')
  }

  if (!credentials.refreshToken) {
    // Application tokens have infinite lifetime; return as-is
    return credentials
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })

  const refreshed = await fetchToken(accountSlug, body)
  return {
    ...refreshed,
    extra: { ...extra, ...((refreshed.extra ?? {}) as Record<string, unknown>) },
  }
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
