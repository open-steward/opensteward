/**
 * VARIO Cloud auth helpers.
 *
 * VARIO uses OAuth 2.0 (password grant). We model the integration as
 * "api_key"-style by requiring the caller to supply:
 *   - tenant: VARIO Cloud tenant slug (subdomain)
 *   - username / password: VARIO user credentials (API password)
 *   - clientId / clientSecret: OAuth app credentials from Admin → API-Clients
 *
 * exchangeCredentials() performs the token exchange and stores the
 * access_token as credentials.accessToken plus refresh_token in extra.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import axios from 'axios'
import { SSO_TOKEN_ENDPOINT_TEMPLATE } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('vario-software uses OAuth2 password grant; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'tenant', label: 'VARIO Tenant (subdomain)', type: 'text', required: true },
    { name: 'clientId', label: 'OAuth Client ID', type: 'text', required: true },
    { name: 'clientSecret', label: 'OAuth Client Secret', type: 'password', required: true },
    { name: 'username', label: 'VARIO Username', type: 'text', required: true },
    { name: 'password', label: 'VARIO API Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { tenant, clientId, clientSecret, username, password } = fields
  if (!tenant || !clientId || !clientSecret || !username || !password) {
    throw new Error('vario-software requires tenant, clientId, clientSecret, username, password')
  }

  const tokenUrl = SSO_TOKEN_ENDPOINT_TEMPLATE.replace('{tenant}', tenant)
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
  })

  const { data } = await axios.post<{ access_token: string; refresh_token?: string; expires_in?: number }>(
    tokenUrl,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  return {
    accessToken: data.access_token,
    extra: {
      tenant,
      clientId,
      clientSecret,
      refreshToken: data.refresh_token ?? '',
      expiresAt: data.expires_in ? String(Date.now() + data.expires_in * 900) : '',
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const { tenant, clientId, clientSecret, refreshToken } = credentials.extra as Record<string, string>
  if (!tenant || !refreshToken) return credentials

  const tokenUrl = SSO_TOKEN_ENDPOINT_TEMPLATE.replace('{tenant}', tenant)
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId ?? '',
    client_secret: clientSecret ?? '',
    refresh_token: refreshToken,
  })

  try {
    const { data } = await axios.post<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      tokenUrl,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    return {
      accessToken: data.access_token,
      extra: {
        ...credentials.extra,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: data.expires_in ? String(Date.now() + data.expires_in * 900) : '',
      },
    }
  } catch {
    return credentials
  }
}
