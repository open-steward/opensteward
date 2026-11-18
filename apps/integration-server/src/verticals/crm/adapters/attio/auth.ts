import type { Credentials } from '@opensteward/shared'

const TOKEN_URL = 'https://app.attio.com/oauth/token'

export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL('https://app.attio.com/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

interface AttioTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Attio token exchange failed: ${text}`)
  }
  const json = await res.json() as AttioTokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}

export async function refreshToken(
  refreshTokenValue: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Attio token refresh failed: ${text}`)
  }
  const json = await res.json() as AttioTokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshTokenValue,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
