/**
 * Icertis Contract Intelligence (ICI) OAuth2 helpers.
 *
 * ICI delegates identity to Microsoft Entra ID (Azure AD). The
 * authorization-code grant is used: the app redirects the user to the
 * tenant-scoped authorize endpoint, exchanges the returned code at the
 * tenant-scoped token endpoint, and calls the ICI REST API with the JWT as
 * a Bearer token. ICI validates the JWT audience against `api://<clientId>`,
 * so we request the `api://<clientId>/.default` scope.
 *
 * Three values belong to the customer rather than the deployment: the ICI
 * API gateway (`https://api-<region><N>.icertis.com`), the Entra directory the
 * app registration lives in, and the `ici-product-key` subscription key. They
 * are collected per connection (`oauthFields`) and carried on
 * `credentials.extra`; the gateway receives the bearer token on every call, so
 * it is held to icertis.com.
 *
 * Docs: https://centralindia-nonprod-apim.developer.azure-api.net/get-started
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_TENANT,
  OAUTH_AUTHORIZE_URL_TEMPLATE,
  OAUTH_TOKEN_URL_TEMPLATE,
} from './constants'

const ICERTIS_SUFFIX = '.icertis.com'
const GATEWAY_REQUIRED = 'Icertis API gateway URL is required (e.g. https://api-us1.icertis.com).'
const GATEWAY_FOREIGN = 'Icertis API gateway must be an *.icertis.com host.'
const GATEWAY_NOT_CONFIGURED = 'Icertis API gateway URL is not configured for this connection.'
const TENANT_INVALID =
  'Microsoft Entra tenant ID must be a directory (tenant) ID or a verified domain.'

/**
 * Reduce what a customer typed for their ICI gateway to an https origin:
 * `api-us1.icertis.com` and `https://API-US1.icertis.com/api/v1/` both become
 * `https://api-us1.icertis.com`. Hosts outside icertis.com are refused.
 */
export function normaliseIcertisGatewayUrl(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '').trim().toLowerCase()
  if (!s) throw new Error(GATEWAY_REQUIRED)
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(s)?.[1]
  if (scheme && scheme !== 'https') throw new Error('Icertis API gateway URL must use https.')
  const host = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '')
  const labelsOk = host
    .split('.')
    .every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  if (!labelsOk || !host.endsWith(ICERTIS_SUFFIX) || host.length <= ICERTIS_SUFFIX.length) {
    throw new Error(GATEWAY_FOREIGN)
  }
  return `https://${host}`
}

/**
 * An Entra directory is a GUID or a verified domain; it becomes a path segment
 * of the Microsoft login URL, so anything else is refused. Blank means "not
 * given" — the caller falls back to the multi-tenant endpoint.
 */
export function normaliseEntraTenant(raw: unknown): string | undefined {
  const s = (typeof raw === 'string' ? raw : '').trim().toLowerCase()
  if (!s) return undefined
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(s) || s.includes('..')) {
    throw new Error(TENANT_INVALID)
  }
  return s
}

/** The gateway a stored connection talks to, falling back to deployment config. */
export function connectionIcertisGateway(credentials: Credentials, fallback?: string): string {
  const stored = credentials.extra?.['instanceUrl']
  const raw = typeof stored === 'string' && stored.trim() ? stored : fallback
  if (!raw || !raw.trim()) throw new Error(GATEWAY_NOT_CONFIGURED)
  return normaliseIcertisGatewayUrl(raw)
}

function tokenUrl(tenant: string): string {
  return OAUTH_TOKEN_URL_TEMPLATE.replace('{tenant}', encodeURIComponent(tenant))
}

function authorizeUrl(tenant: string): string {
  return OAUTH_AUTHORIZE_URL_TEMPLATE.replace('{tenant}', encodeURIComponent(tenant))
}

/** ICI validates the JWT audience as `api://<clientId>`; the matching
 *  resource scope is `api://<clientId>/.default`. */
function resourceScope(clientId: string): string {
  return `api://${clientId}/.default`
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  tenant: string | undefined,
  instanceUrl: string | undefined,
): string {
  // The gateway is not part of the authorize URL, but a connection without a
  // usable one cannot make a single API call — refuse before the redirect.
  normaliseIcertisGatewayUrl(instanceUrl)
  const allScopes = [...scopes, resourceScope(clientId)]
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: allScopes.join(' '),
    state,
  })
  return `${authorizeUrl(normaliseEntraTenant(tenant) ?? DEFAULT_TENANT)}?${params.toString()}`
}

interface EntraTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  tenant: string | undefined,
  instanceUrl: string | undefined,
  productKey: string | undefined,
): Promise<Credentials> {
  const gateway = normaliseIcertisGatewayUrl(instanceUrl)
  const tenantId = normaliseEntraTenant(tenant) ?? DEFAULT_TENANT
  const key = (productKey ?? '').trim()
  const { data } = await axios.post<EntraTokenResponse>(
    tokenUrl(tenantId),
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: [resourceScope(clientId), 'offline_access'].join(' '),
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: {
      tenantId,
      instanceUrl: gateway,
      ...(key ? { productKey: key } : {}),
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const tenant = normaliseEntraTenant(credentials.extra?.['tenantId']) ?? DEFAULT_TENANT
  const { data } = await axios.post<EntraTokenResponse>(
    tokenUrl(tenant),
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope: [resourceScope(clientId), 'offline_access'].join(' '),
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra ?? {},
  }
}
