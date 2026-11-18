import type { Credentials } from '@opensteward/shared'

const TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  locationId?: string
  userId?: string
}

/**
 * Build the HighLevel OAuth2 authorisation URL.
 *
 * The `scope` param should cover at minimum:
 *   contacts.readonly contacts.write opportunities.readonly opportunities.write
 *   businesses.readonly businesses.write
 *
 * Companies are read from the Businesses API (businesses.readonly). The
 * documented companies.readonly is an Agency scope for GET /companies/:companyId
 * only, and no companies.write scope is documented
 * (https://marketplace.gohighlevel.com/docs/Authorization/Scopes).
 */
export function buildAuthUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
  scope?: string
}): string {
  const url = new URL('https://marketplace.gohighlevel.com/oauth/chooselocation')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('state', opts.state)
  url.searchParams.set(
    'scope',
    opts.scope ??
      'contacts.readonly contacts.write opportunities.readonly opportunities.write businesses.readonly businesses.write',
  )
  return url.toString()
}

export async function exchangeCode(opts: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
}): Promise<Credentials> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HighLevel token exchange failed: ${text}`)
  }

  const json = (await res.json()) as TokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
    extra: {
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      locationId: json.locationId,
    },
  }
}

export async function refreshToken(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const extra = credentials.extra ?? {}
  const clientId = extra['clientId'] as string | undefined
  const clientSecret = extra['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) return credentials

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HighLevel token refresh failed: ${text}`)
  }

  const json = (await res.json()) as TokenResponse
  return {
    ...credentials,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
  }
}
