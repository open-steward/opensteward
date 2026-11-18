/**
 * Corteza CRM OAuth2 auth helpers.
 *
 * Corteza is self-hosted and implements the standard OAuth2 authorization-code
 * grant on the customer's own server:
 *   Auth endpoint:  {baseUrl}/auth/oauth2/authorize
 *   Token endpoint: {baseUrl}/auth/oauth2/token
 *
 * The base URL is the customer's, typed on the Connect page. It receives this
 * deployment's client secret and the customer's tokens, so it is normalised,
 * must be https, and must resolve to a public address before any token request.
 *
 * Docs: https://docs.cortezaproject.org/corteza-docs/2024.9/integrator-guide/authentication/
 */

import { assertPublicHost, type Credentials } from '@opensteward/shared'
import {
  CORTEZA_AUTH_PATH,
  CORTEZA_TOKEN_PATH,
  DEFAULT_CORTEZA_SCOPES,
} from './constants'

export interface CortezaOAuthConfig {
  /** OAuth2 client ID registered in Corteza Admin > Auth clients. */
  clientId: string
  /** OAuth2 client secret. */
  clientSecret: string
  /** Redirect URI registered on the OAuth2 client. */
  redirectUri: string
  /** Base URL of the customer's Corteza server, e.g. https://corteza.example.com */
  baseUrl?: string
  /** OAuth scopes to request. Defaults to ['api']. */
  scopes?: string[]
}

/**
 * Reduce a customer-typed Corteza address to its origin:
 * `corteza.example.com` and `https://Corteza.example.com/compose/ns/crm` both
 * become `https://corteza.example.com`. Rejects blanks, non-https schemes and
 * embedded credentials with a message naming the problem.
 */
export function normaliseBaseUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('Corteza base URL is required (e.g. https://corteza.example.com).')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('Corteza base URL must be a valid https:// URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Corteza base URL must use https://.')
  if (url.username || url.password) {
    throw new Error('Corteza base URL must not contain a username or password.')
  }
  return url.origin
}

export function buildAuthUrl(config: CortezaOAuthConfig, state: string): string {
  const url = new URL(`${normaliseBaseUrl(config.baseUrl)}${CORTEZA_AUTH_PATH}`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_CORTEZA_SCOPES).join(' '))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

interface CortezaTokenResponse {
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
): Promise<{ baseUrl: string; json: CortezaTokenResponse }> {
  const baseUrl = normaliseBaseUrl(rawBaseUrl)
  await assertPublicHost(new URL(baseUrl).hostname)
  const res = await fetch(`${baseUrl}${CORTEZA_TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${failure}: ${text}`)
  }

  return { baseUrl, json: (await res.json()) as CortezaTokenResponse }
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
}

export async function exchangeCode(
  config: CortezaOAuthConfig,
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
    'Corteza token exchange failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    extra: { baseUrl },
  }
}

export async function refreshToken(
  config: Pick<CortezaOAuthConfig, 'clientId' | 'clientSecret' | 'baseUrl'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const { baseUrl, json } = await requestToken(
    config.baseUrl,
    {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: credentials.refreshToken,
    },
    'Corteza token refresh failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: expiryFrom(json.expires_in),
    extra: { ...(credentials.extra ?? {}), baseUrl },
  }
}
