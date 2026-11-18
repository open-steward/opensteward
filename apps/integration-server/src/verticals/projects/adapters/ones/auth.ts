/**
 * ONES OpenAPI v2 OAuth2 (3-legged, authorization-code grant).
 *
 * Authorization-code grant with refresh tokens. The access token is sent as
 * `Authorization: Bearer <token>` on every API request.
 *
 * Every endpoint lives on the customer's own ONES domain
 * (`https://your-domain/oauth2/token`), so the domain is collected per
 * connection (`oauthFields`) and carried on `credentials.extra`. It is
 * free-form (SaaS or private deployment) and receives the client secret, so it
 * must be https and resolve to a public address before any request.
 *
 * Token response shape:
 *   { access_token, refresh_token?, token_type: "Bearer", expires_in,
 *     scope, user_id }
 *
 * After refresh, both the old access_token and old refresh_token become
 * invalid — the new pair must be persisted immediately.
 *
 * Docs: https://docs.ones.com/developer/openapi/auth/credential-types
 */
import axios from 'axios'
import { assertPublicHost, type Credentials } from '@opensteward/shared'
import { authorizeUrl, tokenUrl } from './constants'

const DOMAIN_REQUIRED = 'ONES domain is required (e.g. https://acme.ones.com).'
const DOMAIN_INVALID = 'ONES domain is not a valid https URL.'
const DOMAIN_NOT_CONFIGURED = 'ONES domain is not configured for this connection.'

/**
 * Reduce what a customer typed for their ONES domain to an https origin:
 * `acme.ones.com`, `https://ACME.ones.com/project/#/team/x` both become
 * `https://acme.ones.com`. Anything but https is refused.
 */
export function normaliseOnesDomain(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (!s) throw new Error(DOMAIN_REQUIRED)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)?.[1]?.toLowerCase()
  if (scheme && scheme !== 'https') throw new Error('ONES domain must use https.')
  let url: URL
  try {
    url = new URL(scheme ? s : `https://${s}`)
  } catch {
    throw new Error(DOMAIN_INVALID)
  }
  if (url.username || url.password || !url.hostname) throw new Error(DOMAIN_INVALID)
  return url.origin
}

/** The domain a stored connection talks to, falling back to deployment config. */
export function connectionOnesDomain(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['domain']
  const raw = typeof stored === 'string' && stored.trim() ? stored : fallback
  if (!raw || !raw.trim()) throw new Error(DOMAIN_NOT_CONFIGURED)
  return normaliseOnesDomain(raw)
}

export function buildAuthUrl(
  domain: string | undefined,
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
  return `${authorizeUrl(normaliseOnesDomain(domain))}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope?: string
  user_id?: string
}

export async function exchangeCode(
  domain: string | undefined,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const origin = normaliseOnesDomain(domain)
  await assertPublicHost(new URL(origin).hostname)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl(origin),
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
    extra: { userId: data.user_id, domain: origin },
  }
}

export async function refreshCredentials(
  domain: string | undefined,
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const origin = connectionOnesDomain(credentials, domain)
  await assertPublicHost(new URL(origin).hostname)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl(origin),
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
    extra: { ...(credentials.extra ?? {}), domain: origin },
  }
}
