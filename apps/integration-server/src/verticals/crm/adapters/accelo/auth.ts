/**
 * Accelo OAuth2 helpers.
 *
 * Every Accelo tenant has its own deployment host: the authorize endpoint, the
 * token endpoint and the API all live on `{deployment}.api.accelo.com`. The
 * deployment is the customer's, so deployment-level config cannot know it —
 * it is collected on the Connect page (`oauthFields`), replayed at token
 * exchange, and persisted in `credentials.extra.deployment` for refresh and
 * API calls.
 *
 * Token requests authenticate the client with HTTP Basic
 * (`{client_id}:{client_secret}`), as Accelo requires for every token request.
 *
 * Docs: https://api.accelo.com/docs/#authentication
 */

import type { Credentials } from '@opensteward/shared'
import { acceloAuthUrl, acceloTokenUrl, DEFAULT_ACCELO_SCOPES } from './constants'

export interface AcceloOAuthConfig {
  /** Accelo deployment subdomain, e.g. "mycompany". */
  deployment: string
  clientId: string
  clientSecret: string
  redirectUri: string
  /** OAuth scopes to request. Defaults to DEFAULT_ACCELO_SCOPES when omitted. */
  scopes?: string[]
}

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Reduce whatever a customer typed for their Accelo deployment to the bare
 * subdomain: `mycompany`, `mycompany.accelo.com`, `mycompany.api.accelo.com`
 * and pasted URLs of either all become `mycompany`. Rejects blanks and any host
 * outside `accelo.com`, because the token exchange sends the client secret to
 * the host built from this value.
 */
export function normaliseDeployment(raw: string | undefined | null): string {
  const s = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error('Accelo deployment is required (e.g. mycompany for mycompany.accelo.com).')
  const sub = s.replace(/\.(?:api\.)?accelo\.com$/, '')
  if ((s.includes('.') && sub === s) || !DNS_LABEL.test(sub)) {
    throw new Error('Accelo deployment must be a *.accelo.com host.')
  }
  return sub
}

export function buildAuthUrl(config: AcceloOAuthConfig, state: string): string {
  const url = new URL(acceloAuthUrl(normaliseDeployment(config.deployment)))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_ACCELO_SCOPES).join(' '))
  url.searchParams.set('state', state)
  return url.toString()
}

interface AcceloTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

async function requestToken(
  deployment: string,
  clientId: string,
  clientSecret: string,
  params: Record<string, string>,
  failure: string,
): Promise<AcceloTokenResponse> {
  const res = await fetch(acceloTokenUrl(deployment), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams(params).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${failure}: ${text}`)
  }

  return (await res.json()) as AcceloTokenResponse
}

function expiryFrom(expiresIn: number | undefined): Date | undefined {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined
}

export async function exchangeCode(
  config: AcceloOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const deployment = normaliseDeployment(config.deployment)
  const json = await requestToken(
    deployment,
    config.clientId,
    config.clientSecret,
    { grant_type: 'authorization_code', redirect_uri: redirectUri, code },
    'Accelo token exchange failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: expiryFrom(json.expires_in),
    extra: { deployment },
  }
}

export async function refreshToken(
  config: Pick<AcceloOAuthConfig, 'deployment' | 'clientId' | 'clientSecret'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const deployment = normaliseDeployment(config.deployment)
  const json = await requestToken(
    deployment,
    config.clientId,
    config.clientSecret,
    { grant_type: 'refresh_token', refresh_token: credentials.refreshToken },
    'Accelo token refresh failed',
  )

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: expiryFrom(json.expires_in),
    extra: { ...(credentials.extra ?? {}), deployment },
  }
}
