/**
 * Pega CRM OAuth2 authentication helpers.
 *
 * Pega Platform supports the OAuth2 Authorization Code grant type via its
 * built-in OAuth2 provider. The authorize and token endpoints are hosted at
 * /prweb/PRRestService/oauth2/v1/{authorize|token}, relative to the customer's
 * Pega host (Pega Cloud or on-premises).
 *
 * The host is typed by the customer on the Connect page. It receives this
 * deployment's client secret and the customer's tokens, so it is normalised,
 * must be https, and must resolve to a public address before any token request.
 *
 * Docs:
 *   https://docs.pega.com/bundle/platform/page/platform/security/configure-oauth-2-client-registration.html
 */

import { assertPublicHost, type Credentials } from '@opensteward/shared'
import {
  PEGA_OAUTH_AUTH_PATH,
  PEGA_OAUTH_TOKEN_PATH,
  DEFAULT_PEGA_SCOPES,
} from './constants'

export interface PegaOAuthConfig {
  /** Tenant base URL, e.g. https://acme.pegacloud.io */
  baseUrl: string | undefined
  clientId: string
  clientSecret: string
  redirectUri: string
  /** OAuth scopes to request. Defaults to DEFAULT_PEGA_SCOPES when omitted. */
  scopes?: string[]
}

/**
 * Reduce a customer-typed Pega address to its origin — the adapter appends
 * `/prweb/...` itself: `acme.pegacloud.io` and
 * `https://acme.pegacloud.io/prweb/app/default/` both become
 * `https://acme.pegacloud.io`. Rejects blanks, non-https schemes and embedded
 * credentials with a message naming the problem.
 */
export function normaliseBaseUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('Pega base URL is required (e.g. https://acme.pegacloud.io).')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('Pega base URL must be a valid https:// URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Pega base URL must use https://.')
  if (url.username || url.password) {
    throw new Error('Pega base URL must not contain a username or password.')
  }
  return url.origin
}

export function buildAuthUrl(config: PegaOAuthConfig, state: string): string {
  const url = new URL(`${normaliseBaseUrl(config.baseUrl)}${PEGA_OAUTH_AUTH_PATH}`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_PEGA_SCOPES).join(' '))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

interface PegaTokenResponse {
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
  params: Record<string, string>,
  failure: string,
): Promise<{ baseUrl: string; json: PegaTokenResponse }> {
  const baseUrl = normaliseBaseUrl(rawBaseUrl)
  await assertPublicHost(new URL(baseUrl).hostname)
  const res = await fetch(`${baseUrl}${PEGA_OAUTH_TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${failure}: ${text}`)
  }

  return { baseUrl, json: (await res.json()) as PegaTokenResponse }
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
}

export async function exchangeCode(
  config: PegaOAuthConfig,
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
    'Pega CRM token exchange failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    // Store baseUrl so refreshCredentials and the API client use this tenant
    extra: {
      baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  }
}

export async function refreshToken(
  config: Pick<PegaOAuthConfig, 'baseUrl' | 'clientId' | 'clientSecret'>,
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
    'Pega CRM token refresh failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: expiryFrom(json.expires_in),
    extra: credentials.extra,
  }
}
