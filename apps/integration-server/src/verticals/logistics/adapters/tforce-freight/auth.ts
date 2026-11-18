import type { Credentials } from '../../adapter/interface'
import {
  TFORCE_FREIGHT_TOKEN_URL,
  TFORCE_FREIGHT_DASHBOARD_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface TforceFreightAuthConfig {
  clientId: string
  clientSecret: string
  scope?: string
  sandbox?: boolean
}

export function buildAuthUrl(_state: string): string {
  return TFORCE_FREIGHT_DASHBOARD_URL
}

/**
 * TForce Freight uses OAuth2 client_credentials.
 *
 * `exchangeCode` accepts a "clientId:clientSecret" pair in `code`
 * to fit the canonical adapter interface.
 */
export async function exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
  const [clientId, clientSecret] = code.split(':')
  if (!clientId || !clientSecret) {
    throw new Error('TForce Freight exchangeCode expects "clientId:clientSecret"')
  }
  return exchangeCredentials({ clientId, clientSecret })
}

export async function exchangeCredentials(config: TforceFreightAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })
  if (config.scope) body.set('scope', config.scope)

  const res = await fetch(TFORCE_FREIGHT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TForce Freight token exchange failed (${res.status}): ${text}`)
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

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!isTokenExpired(credentials)) return credentials

  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh TForce Freight credentials: missing clientId/clientSecret in extra')
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

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
