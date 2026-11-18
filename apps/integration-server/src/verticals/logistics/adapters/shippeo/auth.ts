import type { Credentials } from '../../adapter/interface'
import {
  SHIPPEO_TOKEN_URL,
  SHIPPEO_DASHBOARD_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ShippeoAuthConfig {
  clientId: string
  clientSecret: string
  sandbox?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Return the Shippeo developer-portal URL.  Shippeo uses OAuth 2.0
 * client-credentials — there is no interactive consent screen; the portal
 * is used to manage client IDs and secrets.
 */
export function buildAuthUrl(_state: string): string {
  return SHIPPEO_DASHBOARD_URL
}

// ── Token exchange ─────────────────────────────────────────────────────────────

export async function exchangeCredentials(config: ShippeoAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'read write',
  })

  const res = await fetch(SHIPPEO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`shippeo token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type?: string
    expires_in?: number
    scope?: string
  }

  const expiresIn = json.expires_in ?? 3600

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1_000),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      sandbox: config.sandbox,
    },
  }
}

// ── Token refresh ──────────────────────────────────────────────────────────────

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error(
      'shippeo: cannot refresh credentials — clientId / clientSecret missing from extra',
    )
  }

  return exchangeCredentials({
    clientId,
    clientSecret,
    sandbox: extra.sandbox as boolean | undefined,
  })
}

// ── Utility ────────────────────────────────────────────────────────────────────

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
