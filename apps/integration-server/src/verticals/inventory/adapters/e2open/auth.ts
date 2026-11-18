/**
 * E2open OAuth 2.0 authentication helpers.
 *
 * E2open supports two flows:
 *   1. Authorization Code Flow — for user-delegated access (interactive).
 *   2. Client Credentials — for server-to-server integration (machine accounts).
 *
 * The auth URL returned by getAuthUrl() is the standard e2open identity provider
 * authorization endpoint.  exchangeCode() trades the auth code for tokens.
 * refreshCredentials() uses the stored refresh_token to renew access.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

const AUTH_BASE = 'https://login.e2open.com/e2open/as/authorization.oauth2'
const DEFAULT_SCOPES = ['openid', 'profile', 'offline_access']

export interface E2openAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'clientId',     label: 'Client ID',     type: 'text',     required: true },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
    { name: 'redirectUri',  label: 'Redirect URI',  type: 'text',     required: true },
    { name: 'tenantId',     label: 'Tenant (tid)',   type: 'text',     required: true },
  ]
}

export function getAuthUrl(state: string, config: E2openAuthConfig): string {
  const scopes = (config.scopes ?? DEFAULT_SCOPES).join(' ')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     config.clientId,
    redirect_uri:  config.redirectUri,
    scope:         scopes,
    state,
  })
  return `${AUTH_BASE}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  config: E2openAuthConfig,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  config.redirectUri,
    client_id:     config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`e2open token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }

  return {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:    json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    scope: json.scope,
    extra: {
      clientId:     config.clientId,
      clientSecret: config.clientSecret,
      redirectUri:  config.redirectUri,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId     = extra['clientId']     as string | undefined
  const clientSecret = extra['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('e2open: cannot refresh — missing clientId, clientSecret, or refreshToken')
  }

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`e2open token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }

  return {
    accessToken:  json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt:    json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    scope:  json.scope ?? credentials.scope,
    extra,
  }
}
