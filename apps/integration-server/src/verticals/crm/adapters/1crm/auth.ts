/**
 * OAuth2 Authorization Code flow for 1CRM.
 *
 * 1CRM runs per customer (1crmcloud.com or self-hosted). The authorization and
 * token endpoints are on the customer's own instance:
 *   Auth:  {baseUrl}/api.php/auth/user/authorize
 *   Token: {baseUrl}/api.php/auth/user/access_token
 *
 * The URL is typed by the customer on the Connect page. It receives this
 * deployment's client secret and the customer's tokens, so it is normalised,
 * must be https, and must resolve to a public address before any token request.
 *
 * Docs: https://github.com/1CRM/1crm-api-client-php/blob/master/docs-pages/auth.md
 */

import { assertPublicHost, type Credentials } from '@opensteward/shared'
import {
  ONECRM_AUTH_PATH,
  ONECRM_TOKEN_PATH,
  DEFAULT_ONECRM_SCOPES,
} from './constants'

export interface OneCrmOAuthConfig {
  /** Full base URL of the customer's instance, e.g. https://myco.1crmcloud.com */
  baseUrl: string | undefined
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * Reduce a customer-typed 1CRM address to the instance root the adapter
 * appends `/api.php/...` to: `acme.1crmcloud.com` → `https://acme.1crmcloud.com`;
 * `https://portal.example.com/1crm/api.php/data/Contact` →
 * `https://portal.example.com/1crm`. Rejects blanks, non-https schemes and
 * embedded credentials with a message naming the problem.
 */
export function normaliseBaseUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('1CRM URL is required (e.g. https://yourcompany.1crmcloud.com).')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('1CRM URL must be a valid https:// URL.')
  }
  if (url.protocol !== 'https:') throw new Error('1CRM URL must use https://.')
  if (url.username || url.password) {
    throw new Error('1CRM URL must not contain a username or password.')
  }
  const path = url.pathname.replace(/\/api\.php(?:\/.*)?$/i, '').replace(/\/+$/, '')
  return `${url.origin}${path}`
}

/** Build the OAuth2 authorization URL for the user to visit. */
export function buildAuthUrl(config: OneCrmOAuthConfig, state: string): string {
  const url = new URL(`${normaliseBaseUrl(config.baseUrl)}${ONECRM_AUTH_PATH}`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_ONECRM_SCOPES).join(' '))
  url.searchParams.set('state', state)
  return url.toString()
}

interface OneCrmTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

/**
 * POST to the customer's token endpoint. The body carries the client secret,
 * so the host must resolve to a public address first.
 */
async function requestToken(
  rawBaseUrl: string | undefined,
  params: Record<string, string>,
  failure: string,
): Promise<{ baseUrl: string; json: OneCrmTokenResponse }> {
  const baseUrl = normaliseBaseUrl(rawBaseUrl)
  await assertPublicHost(new URL(baseUrl).hostname)
  const res = await fetch(`${baseUrl}${ONECRM_TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${failure}: ${text}`)
  }

  return { baseUrl, json: (await res.json()) as OneCrmTokenResponse }
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCode(
  config: OneCrmOAuthConfig,
  code: string,
): Promise<Credentials> {
  const { baseUrl, json } = await requestToken(
    config.baseUrl,
    {
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    },
    '1CRM token exchange failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    extra: { baseUrl },
  }
}

/** Refresh an expired access token using the stored refresh token. */
export async function refreshToken(
  config: Pick<OneCrmOAuthConfig, 'baseUrl' | 'clientId' | 'clientSecret'>,
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
    '1CRM token refresh failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: expiryFrom(json.expires_in),
    extra: credentials.extra,
  }
}
