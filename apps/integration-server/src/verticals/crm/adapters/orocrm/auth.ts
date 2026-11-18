/**
 * OroCRM OAuth2 authorization-code flow.
 *
 * OroCRM is self-hosted, so the token and authorization endpoints are
 * relative to the customer-supplied baseUrl (e.g. https://crm.example.com).
 *
 * Token endpoint:      POST {baseUrl}/oauth2-token
 * Authorization URL:   {baseUrl}/oauth2-token/authorize
 *
 * The base URL is typed by the customer on the Connect page. It receives this
 * deployment's client secret and the customer's tokens, so it is normalised,
 * must be https, and must resolve to a public address before any token request.
 *
 * Docs: https://doc.oroinc.com/api/authentication/oauth-authorization-code/
 */
import { assertPublicHost, type Credentials } from '@opensteward/shared'
import { OAUTH_TOKEN_PATH, OAUTH_AUTHORIZE_PATH } from './constants'

export interface OrocrmOAuthConfig {
  /** Customer's OroCRM host, e.g. https://crm.example.com */
  baseUrl: string | undefined
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Optional scopes — OroCRM's built-in scopes depend on installed bundles. */
  scopes?: string[]
}

/**
 * Reduce a customer-typed OroCRM address to its installation root:
 * `crm.example.com` → `https://crm.example.com`; `https://example.com/oro/`
 * → `https://example.com/oro` (installations may live under a path). Query
 * and fragment are dropped. Rejects blanks, non-https schemes and embedded
 * credentials with a message naming the problem.
 */
export function normaliseBaseUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('OroCRM base URL is required (e.g. https://crm.example.com).')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('OroCRM base URL must be a valid https:// URL.')
  }
  if (url.protocol !== 'https:') throw new Error('OroCRM base URL must use https://.')
  if (url.username || url.password) {
    throw new Error('OroCRM base URL must not contain a username or password.')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export function buildAuthUrl(config: OrocrmOAuthConfig, state: string): string {
  const url = new URL(`${normaliseBaseUrl(config.baseUrl)}${OAUTH_AUTHORIZE_PATH}`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('state', state)
  if (config.scopes && config.scopes.length > 0) {
    url.searchParams.set('scope', config.scopes.join(' '))
  }
  return url.toString()
}

interface OrocrmTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

/**
 * POST to the customer's token endpoint. The body carries the client secret,
 * so the host must resolve to a public address first.
 */
async function requestToken(
  rawBaseUrl: string | undefined,
  body: Record<string, string>,
  failure: string,
): Promise<{ baseUrl: string; json: OrocrmTokenResponse }> {
  const baseUrl = normaliseBaseUrl(rawBaseUrl)
  await assertPublicHost(new URL(baseUrl).hostname)
  const res = await fetch(`${baseUrl}${OAUTH_TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${failure}: ${text}`)
  }

  return { baseUrl, json: (await res.json()) as OrocrmTokenResponse }
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
}

export async function exchangeCode(
  config: OrocrmOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const { baseUrl, json } = await requestToken(
    config.baseUrl,
    {
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      code,
    },
    'OroCRM token exchange failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    extra: { baseUrl, clientId: config.clientId, clientSecret: config.clientSecret },
  }
}

export async function refreshToken(
  config: Pick<OrocrmOAuthConfig, 'baseUrl' | 'clientId' | 'clientSecret'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const { json } = await requestToken(
    config.baseUrl,
    {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: credentials.refreshToken,
    },
    'OroCRM token refresh failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: expiryFrom(json.expires_in),
    extra: credentials.extra,
  }
}
