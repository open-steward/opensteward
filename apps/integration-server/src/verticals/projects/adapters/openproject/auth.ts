import axios from 'axios'
import { assertPublicHost, type Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_PATH, OAUTH_TOKEN_PATH } from './constants'

/**
 * OpenProject OAuth2 (Doorkeeper) — authorization-code flow.
 *
 * Endpoints are relative to the customer's instance (e.g.
 * `https://acme.openproject.com`, or a self-hosted install that may live under
 * a sub-path), so the instance URL is collected per connection
 * (`oauthFields`) and carried on `credentials.extra`. It is free-form and
 * receives the client secret, so it must be https and resolve to a public
 * address before any request. Access tokens are Bearer; default lifetime is
 * 7200s; a refresh token is issued. The only scope is `api_v3`.
 */

const URL_REQUIRED = 'OpenProject instance URL is required (e.g. https://acme.openproject.com).'
const URL_INVALID = 'OpenProject instance URL is not a valid https URL.'
const URL_NOT_CONFIGURED = 'OpenProject instance URL is not configured for this connection.'

/**
 * Reduce what a customer typed for their instance to `https://host[/sub-path]`
 * with no trailing slash, query or fragment. Anything but https is refused.
 */
export function normaliseOpenProjectUrl(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (!s) throw new Error(URL_REQUIRED)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)?.[1]?.toLowerCase()
  if (scheme && scheme !== 'https') throw new Error('OpenProject instance URL must use https.')
  let url: URL
  try {
    url = new URL(scheme ? s : `https://${s}`)
  } catch {
    throw new Error(URL_INVALID)
  }
  if (url.username || url.password || !url.hostname) throw new Error(URL_INVALID)
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** The instance a stored connection talks to, falling back to deployment config. */
export function connectionOpenProjectUrl(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['instanceUrl']
  const raw = typeof stored === 'string' && stored.trim() ? stored : fallback
  if (!raw || !raw.trim()) throw new Error(URL_NOT_CONFIGURED)
  return normaliseOpenProjectUrl(raw)
}

export function buildAuthUrl(
  instanceUrl: string | undefined,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${normaliseOpenProjectUrl(instanceUrl)}${OAUTH_AUTHORIZE_PATH}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope?: string
  created_at?: number
}

export async function exchangeCode(
  instanceUrl: string | undefined,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const base = normaliseOpenProjectUrl(instanceUrl)
  await assertPublicHost(new URL(base).hostname)
  const { data } = await axios.post<TokenResponse>(
    `${base}${OAUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: { instanceUrl: base },
  }
}

export async function refreshCredentials(
  instanceUrl: string | undefined,
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const base = connectionOpenProjectUrl(credentials, instanceUrl)
  await assertPublicHost(new URL(base).hostname)
  const { data } = await axios.post<TokenResponse>(
    `${base}${OAUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? credentials.scope,
    extra: { ...(credentials.extra ?? {}), instanceUrl: base },
  }
}
