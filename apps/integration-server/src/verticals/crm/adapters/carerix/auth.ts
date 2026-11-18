/**
 * Carerix OAuth2 authorization-code flow helpers.
 *
 * Carerix uses Keycloak as its OIDC provider. Each customer ("system name")
 * has its own realm, hosted on one of several identity servers
 * (`id.carerix.io`, `id-2.carerix.io`, …):
 *
 *   https://{identityServer}/auth/realms/{tenantSlug}/protocol/openid-connect/{auth|token}
 *
 * Both values are the customer's, so they are collected on the Connect page
 * (`oauthFields`) and persisted in `credentials.extra` for refresh.
 *
 * Docs: https://help.carerix.com/en/articles/9482350-graphql-api
 *       https://help.carerix.com/en/articles/13168219-carerix-marketplace-framework-technical-description
 */

import type { Credentials } from '@opensteward/shared'
import {
  carerixAuthUrl,
  carerixTokenUrl,
  CARERIX_DEFAULT_IDENTITY_SERVER,
  DEFAULT_CARERIX_SCOPES,
} from './constants'

export interface CarerixOAuthConfig {
  /** Carerix system/tenant slug, e.g. "acmedemo". */
  tenantSlug: string
  /** Keycloak identity server host, e.g. "id-2.carerix.io". Defaults to id.carerix.io. */
  identityServer?: string
  clientId: string
  clientSecret: string
  redirectUri: string
  /** OAuth scopes. Defaults to DEFAULT_CARERIX_SCOPES when omitted. */
  scopes?: string[]
}

const REALM_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const IDENTITY_SERVER_LABEL = /^id(?:-\d{1,3})?$/
const CARERIX_IO = '.carerix.io'

/**
 * The customer's Carerix system name — the Keycloak realm. It is placed in
 * the identity-server path, so anything but a bare realm name is refused.
 */
export function normaliseTenantSlug(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error('Carerix system name is required (e.g. acmedemo).')
  if (!REALM_NAME.test(s)) {
    throw new Error('Carerix system name may contain only letters, digits, hyphens and underscores.')
  }
  return s
}

/**
 * The customer's identity server host. Blank means the default
 * `id.carerix.io`; `id-2`, `id-2.carerix.io` and a pasted token URL all become
 * `id-2.carerix.io`. Anything outside `id*.carerix.io` is refused, because the
 * token exchange sends the client secret there.
 */
export function normaliseIdentityServer(raw: string | undefined | null): string {
  const s = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) return CARERIX_DEFAULT_IDENTITY_SERVER
  const label = s.endsWith(CARERIX_IO) ? s.slice(0, -CARERIX_IO.length) : s
  if (!IDENTITY_SERVER_LABEL.test(label)) {
    throw new Error('Carerix identity server must be an id*.carerix.io host.')
  }
  return `${label}${CARERIX_IO}`
}

export function buildAuthUrl(config: CarerixOAuthConfig, state: string): string {
  const url = new URL(
    carerixAuthUrl(
      normaliseTenantSlug(config.tenantSlug),
      normaliseIdentityServer(config.identityServer),
    ),
  )
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_CARERIX_SCOPES).join(' '))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  config: CarerixOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const tenantSlug = normaliseTenantSlug(config.tenantSlug)
  const identityServer = normaliseIdentityServer(config.identityServer)
  const tokenUrl = carerixTokenUrl(tenantSlug, identityServer)
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Carerix token exchange failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { tenantSlug, identityServer },
  }
}

export async function refreshToken(
  config: Pick<CarerixOAuthConfig, 'tenantSlug' | 'identityServer' | 'clientId' | 'clientSecret'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const tokenUrl = carerixTokenUrl(
    normaliseTenantSlug(config.tenantSlug),
    normaliseIdentityServer(config.identityServer),
  )
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: credentials.refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Carerix token refresh failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: credentials.extra,
  }
}
