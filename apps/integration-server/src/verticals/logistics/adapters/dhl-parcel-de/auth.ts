import type { Credentials } from '../../adapter/interface'
import { DHL_PARCEL_DE_TOKEN_URL, DHL_PARCEL_DE_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface DhlParcelDeAuthConfig {
  clientId: string
  clientSecret: string
  sandbox?: boolean
}

export function buildAuthUrl(_state: string): string {
  return DHL_PARCEL_DE_DASHBOARD_URL
}

export async function exchangeCredentials(config: DhlParcelDeAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetch(DHL_PARCEL_DE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DHL Parcel DE token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      sandbox: config.sandbox,
    },
  }
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // For client_credentials, `code` is used as clientId; secret must be supplied via extra or env.
  // This is a placeholder that treats the code as the access token if provided directly.
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh DHL Parcel DE credentials: missing clientId/clientSecret in extra')
  }

  return exchangeCredentials({
    clientId,
    clientSecret,
    sandbox: extra.sandbox as boolean | undefined,
  })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export async function ensureAuth(credentials: Credentials): Promise<Credentials> {
  if (isTokenExpired(credentials)) {
    return refreshCredentials(credentials)
  }
  return credentials
}
