import type { Credentials } from '../../adapter/interface'
import { OAUTH_TOKEN_URL } from './constants'

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const res = await fetch(OAUTH_TOKEN_URL, {
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
    throw new Error(`Salesloft token exchange failed: ${text}`)
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
  }
}

export async function refreshToken(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const res = await fetch(OAUTH_TOKEN_URL, {
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
    throw new Error(`Salesloft token refresh failed: ${text}`)
  }
  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
