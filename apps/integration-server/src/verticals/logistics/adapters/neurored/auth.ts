import type { Credentials } from '../../adapter/interface'
import {
  NEURORED_OAUTH_AUTHORIZE_URL,
  NEURORED_OAUTH_TOKEN_URL,
  NEURORED_DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface NeuroredAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
}

/**
 * Returns the Salesforce OAuth2 authorization URL for the connected app
 * that hosts the Neurored TMS package.
 */
export function buildAuthUrl(state: string, config: Partial<NeuroredAuthConfig> & { scopes?: string[] } = {}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId ?? '',
    redirect_uri: config.redirectUri ?? '',
    scope: (config.scopes ?? NEURORED_DEFAULT_SCOPES).join(' '),
    state,
  })
  return `${NEURORED_OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface SalesforceTokenResponse {
  access_token: string
  refresh_token?: string
  instance_url: string
  token_type: string
  issued_at?: string
  expires_in?: number
  scope?: string
  id?: string
}

async function fetchToken(body: URLSearchParams): Promise<Credentials> {
  const res = await fetch(NEURORED_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Neurored (Salesforce) token request failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as SalesforceTokenResponse

  // Salesforce tokens do not expire by default unless a session policy is set.
  // We treat a missing expires_in as 2 hours to trigger refresh proactively.
  const expiresInMs = json.expires_in !== undefined ? json.expires_in * 1000 : 2 * 60 * 60 * 1000

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + expiresInMs),
    scope: json.scope,
    extra: {
      instanceUrl: json.instance_url,
    },
  }
}

/**
 * Exchange the OAuth2 authorization code for access + refresh tokens.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  config: NeuroredAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })
  return fetchToken(body)
}

/**
 * Refresh an existing Salesforce access token using the stored refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) {
    throw new Error('Neurored: cannot refresh credentials — no refresh token present')
  }

  const extra = (credentials.extra ?? {}) as Record<string, unknown>

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })

  const fresh = await fetchToken(body)

  // Salesforce does not rotate the refresh token; preserve the original.
  return {
    ...fresh,
    refreshToken: credentials.refreshToken,
    extra: {
      ...extra,
      ...((fresh.extra ?? {}) as Record<string, unknown>),
    },
  }
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
