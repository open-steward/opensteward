/**
 * Lightspeed Retail (X-Series) OAuth2 — Authorization Code Grant.
 *
 * Flow:
 *   1. getAuthUrl()      → redirect user to secure.retail.lightspeed.app/connect
 *   2. exchangeCode()    → POST token to {domain_prefix}.retail.lightspeed.app/api/1.0/token
 *   3. refreshToken()    → same token endpoint with grant_type=refresh_token
 *
 * The domain_prefix is present in the token response as `domain_prefix` and
 * is persisted in credentials.extra so every subsequent request can build the
 * correct base URL.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, SCOPES_DEFAULT } from './constants'

export function credentialFields(): CredentialField[] {
  return []
}

export function getAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes?: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes ?? SCOPES_DEFAULT,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

function tokenUrl(domainPrefix: string): string {
  return `https://${domainPrefix}.retail.lightspeed.app/api/1.0/token`
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  // During initial exchange we don't yet know the domain_prefix; use the
  // generic X-Series token endpoint which responds with the domain_prefix in
  // the JSON body.
  const res = await fetch('https://cloud.lightspeedhq.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`lightspeed-inventory token exchange failed: ${text}`)
  }
  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    domain_prefix?: string
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { domainPrefix: json.domain_prefix ?? '' },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const domainPrefix = String(credentials.extra?.domainPrefix ?? '')
  const url = domainPrefix ? tokenUrl(domainPrefix) : 'https://cloud.lightspeedhq.com/oauth/access_token'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`lightspeed-inventory token refresh failed: ${text}`)
  }
  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    domain_prefix?: string
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: {
      ...credentials.extra,
      domainPrefix: json.domain_prefix ?? credentials.extra?.domainPrefix ?? '',
    },
  }
}
