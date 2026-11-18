import type { Credentials } from '../../adapter/interface'
import {
  AMAZON_SHIPPING_DASHBOARD_URL,
  AMAZON_SHIPPING_LWA_TOKEN_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface AmazonShippingAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  sandbox?: boolean
}

/**
 * Amazon uses Login with Amazon (LWA) for OAuth2. Users grant access via the
 * Seller Central console. We redirect them to Amazon's developer console here.
 */
export function buildAuthUrl(_state: string): string {
  return AMAZON_SHIPPING_DASHBOARD_URL
}

/**
 * Exchanges an LWA authorization code for access + refresh tokens.
 * POSTs to https://api.amazon.com/auth/o2/token with grant_type=authorization_code.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  config: AmazonShippingAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
  })

  const res = await fetch(AMAZON_SHIPPING_LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Amazon Shipping LWA token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri,
      sandbox: config.sandbox,
    },
  }
}

/**
 * Refreshes an LWA access token using the stored refresh_token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  const refreshToken = credentials.refreshToken

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Cannot refresh Amazon Shipping credentials: missing clientId/clientSecret/refreshToken',
    )
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(AMAZON_SHIPPING_LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Amazon Shipping LWA token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope ?? credentials.scope,
    extra: credentials.extra,
  }
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export async function ensureAuth(credentials: Credentials): Promise<Credentials> {
  if (!isTokenExpired(credentials)) return credentials
  return refreshCredentials(credentials)
}
