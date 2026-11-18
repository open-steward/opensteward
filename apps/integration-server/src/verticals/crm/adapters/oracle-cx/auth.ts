import type { Credentials } from '@opensteward/shared'

/**
 * Oracle CX Sales — OAuth2 helpers.
 *
 * Instance-specific OAuth2 endpoints follow the pattern:
 *   {instanceUrl}/oauth2/v1/authorize
 *   {instanceUrl}/oauth2/v1/token
 */

export interface OracleCxAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function buildAuthUrl(
  instanceUrl: string,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL(`${instanceUrl}/oauth2/v1/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  instanceUrl: string,
  config: OracleCxAuthConfig,
  code: string,
): Promise<Credentials> {
  const res = await fetch(`${instanceUrl}/oauth2/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Oracle CX token exchange failed: ${text}`)
  }
  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { instanceUrl },
  }
}

export async function refreshCredentials(
  instanceUrl: string,
  config: Pick<OracleCxAuthConfig, 'clientId' | 'clientSecret'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const res = await fetch(`${instanceUrl}/oauth2/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Oracle CX token refresh failed: ${text}`)
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
