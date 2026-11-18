import type { Credentials } from '@opensteward/shared'

const TOKEN_URL = 'https://www.kommo.com/oauth2/access_token'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

/**
 * Build the Kommo OAuth2 authorisation URL.
 *
 * The subdomain is embedded in the auth URL so the user is routed to their
 * account login page. `mode=popup` is recommended by Kommo for embedded flows.
 */
export function buildAuthUrl(opts: {
  subdomain: string
  clientId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL(`https://${opts.subdomain}.kommo.com/oauth`)
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', opts.state)
  url.searchParams.set('mode', 'popup')
  return url.toString()
}

export async function exchangeCode(opts: {
  subdomain: string
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
}): Promise<Credentials> {
  const res = await fetch(`https://${opts.subdomain}.kommo.com/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Kommo token exchange failed: ${text}`)
  }

  const json = await res.json() as TokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { subdomain: opts.subdomain, clientId: opts.clientId, clientSecret: opts.clientSecret },
  }
}

export async function refreshToken(
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const extra = credentials.extra ?? {}
  const subdomain = extra['subdomain'] as string | undefined
  const clientId = extra['clientId'] as string | undefined
  const clientSecret = extra['clientSecret'] as string | undefined

  if (!subdomain || !clientId || !clientSecret) return credentials

  const tokenUrl = subdomain
    ? `https://${subdomain}.kommo.com/oauth2/access_token`
    : TOKEN_URL

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Kommo token refresh failed: ${text}`)
  }

  const json = await res.json() as TokenResponse
  return {
    ...credentials,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
