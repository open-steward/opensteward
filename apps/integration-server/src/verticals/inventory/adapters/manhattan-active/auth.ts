/**
 * Manhattan Active WM — OAuth 2.0 authentication.
 *
 * Manhattan Active uses the Resource Owner Password Credentials Grant
 * (RFC 6749 §4.3) for server-side integrations.  Client credentials are
 * sent as HTTP Basic Auth to the token endpoint; the resource owner
 * username/password are passed in the POST body.
 *
 * Token endpoint pattern:
 *   https://<env>-auth.omni.manh.com/oauth/token
 *
 * Reference: https://developer.manh.com/docs/how-to/rest-api/authentication/
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { authTokenUrl } from './constants'

export function credentialFields(): CredentialField[] {
  return [
    { name: 'environment', label: 'Environment ID', type: 'text', required: true },
    { name: 'clientId', label: 'OAuth Client ID', type: 'text', required: true },
    { name: 'clientSecret', label: 'OAuth Client Secret', type: 'password', required: true },
    { name: 'username', label: 'API Username (email)', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { environment, clientId, clientSecret, username, password } = fields
  if (!environment || !clientId || !clientSecret || !username || !password) {
    throw new Error('manhattan-active: environment, clientId, clientSecret, username, and password are all required')
  }

  const tokenUrl = authTokenUrl(environment)
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`manhattan-active token exchange failed (${res.status}): ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    // The connect form is the only way in (auth_type is not oauth2), so the
    // per-connection client secret must be kept for refreshCredentials().
    extra: { environment, clientId, clientSecret },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  fallbackClientSecret = '',
): Promise<Credentials> {
  // Manhattan Active tokens are short-lived (max 24h).  If a refresh_token
  // was issued, use it; otherwise fall through and let the caller re-exchange.
  if (!credentials.refreshToken) return credentials

  const environment = String(credentials.extra?.['environment'] ?? '')
  const clientId = String(credentials.extra?.['clientId'] ?? '')
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '') || fallbackClientSecret
  if (!environment || !clientId || !clientSecret) return credentials

  const tokenUrl = authTokenUrl(environment)
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    // Token expired / revoked — caller must re-exchange via credentialFields.
    return credentials
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    ...credentials,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
