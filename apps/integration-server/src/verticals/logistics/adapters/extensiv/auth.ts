import type { Credentials } from '../../adapter/interface'
import { EXTENSIV_TOKEN_URL, EXTENSIV_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface ExtensivAuthConfig {
  clientId: string
  clientSecret: string
  tplGuid?: string
  userLoginId?: string
  sandbox?: boolean
}

export function buildAuthUrl(_state: string): string {
  return EXTENSIV_DASHBOARD_URL
}

export async function exchangeCredentials(config: ExtensivAuthConfig): Promise<Credentials> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const body = {
    grant_type: 'client_credentials',
    tpl: config.tplGuid,
    user_login_id: config.userLoginId,
  }

  const res = await fetch(EXTENSIV_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/hal+json',
      Accept: 'application/hal+json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Extensiv token exchange failed (${res.status}): ${text}`)
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
      tplGuid: config.tplGuid,
      userLoginId: config.userLoginId,
      sandbox: config.sandbox,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh Extensiv credentials: missing clientId/clientSecret in extra')
  }

  return exchangeCredentials({
    clientId,
    clientSecret,
    tplGuid: extra.tplGuid as string | undefined,
    userLoginId: extra.userLoginId as string | undefined,
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
