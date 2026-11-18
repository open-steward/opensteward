/**
 * Kibo Commerce auth — OAuth2 client-credentials flow.
 *
 * Kibo does not expose a user-facing OAuth2 authorization page.  Tokens are
 * minted server-side via `POST {TOKEN_ENDPOINT}` with an
 * `Authorization: Basic base64(clientId:clientSecret)` header and a
 * `grant_type=client_credentials` body.
 *
 * Credentials shape stored in the canonical `Credentials` type:
 *   {
 *     accessToken:  string,          // Bearer token
 *     expiresAt:    Date,            // absolute expiry (never ISO string)
 *     extra: {
 *       clientId:   string,
 *       clientSecret: string,
 *       tenant?:    string,          // if set, base URL becomes https://{tenant}.mozu.com
 *     }
 *   }
 */

import axios from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { TOKEN_ENDPOINT, TOKEN_LIFETIME_SECONDS, DEFAULT_BASE_URL } from './constants'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function resolveBaseUrl(tenant: string | undefined): string {
  if (tenant) {
    return `https://${tenant}.mozu.com`
  }
  return DEFAULT_BASE_URL
}

// ── Tenant host ───────────────────────────────────────────────────────────────

/**
 * A Kibo tenant's API host: `t{tenantId}[-s{siteId}]` on one of Kibo's own
 * domains, e.g. `t12345.sandbox.mozu.com`, `t12345.tp0.mozu.com`, or a
 * regional `t12345.sb.euw0.kibocommerce.com`. The token request carries the
 * client secret to this host, so nothing else is accepted.
 */
const TENANT_HOST = /^t(\d+)(?:-s\d+)?(?:\.[a-z0-9-]+)*\.(?:mozu\.com|kibocommerce\.com)$/

/** Accepts a bare host or a pasted URL; returns the lowercase host. */
export function normaliseTenantHost(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#:].*$/, '')
  if (!value) throw new Error('Kibo tenant host is required (e.g. t12345.sandbox.mozu.com).')
  if (!TENANT_HOST.test(value)) {
    throw new Error(
      'Kibo tenant host must be your t{tenantId}….mozu.com or t{tenantId}….kibocommerce.com host.',
    )
  }
  return value
}

/** `t12345.sandbox.mozu.com` → `12345` (the `x-vol-tenant` header). */
export function tenantIdFromHost(host: string): string {
  return TENANT_HOST.exec(host)?.[1] ?? ''
}

export const CREDENTIAL_FIELDS: CredentialField[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', required: true },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
  {
    name: 'tenantHost',
    label: 'Tenant host',
    type: 'text',
    required: true,
    placeholder: 't12345.sandbox.mozu.com',
    helpText:
      'The host your tenant’s API is served from — t{tenantId}.sandbox.mozu.com, ' +
      't{tenantId}.tp0.mozu.com, or a regional ….kibocommerce.com host.',
  },
]

// ── Auth methods ──────────────────────────────────────────────────────────────

/**
 * Kibo uses client-credentials — there is no user-facing authorization URL.
 * Calling this method always throws a descriptive error.
 */
export function getAuthUrl(_state: string): never {
  throw new Error(
    'Kibo Commerce uses OAuth2 client-credentials — there is no user-facing authorization URL. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "kibo", credentials: {clientId, clientSecret, tenantHost}}`. ' +
      'The adapter bootstraps tokens automatically via refreshCredentials.',
  )
}

/**
 * Kibo uses client-credentials — there is no authorization code to exchange.
 * Calling this method always throws a descriptive error.
 */
export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Kibo Commerce uses OAuth2 client-credentials — no authorization code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "kibo", credentials: {clientId, clientSecret, tenantHost}}`. ' +
      'The adapter bootstraps tokens automatically via refreshCredentials.',
  )
}

// ── Token fetch ───────────────────────────────────────────────────────────────

interface KiboTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

/**
 * Fetch a fresh access token from the Kibo token endpoint using
 * `grant_type=client_credentials` and Basic auth.
 */
export async function fetchToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await axios.post<KiboTokenResponse>(
    TOKEN_ENDPOINT,
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30_000,
    },
  )

  if (!res.data.access_token) {
    throw new Error('Kibo token endpoint returned an empty access_token')
  }

  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_SECONDS * 1000),
  }
}

/**
 * Mint a token on the tenant's own host: JSON body, as Kibo documents for
 * `/api/platform/applications/authtickets/oauth`. `tenantHost` must already
 * be normalised.
 */
export async function fetchTenantToken(
  tenantHost: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await axios.post<KiboTokenResponse>(
    `https://${tenantHost}/api/platform/applications/authtickets/oauth`,
    { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  if (!res.data?.access_token) {
    throw new Error('Kibo token endpoint returned an empty access_token')
  }
  const lifetime =
    typeof res.data.expires_in === 'number' ? res.data.expires_in : TOKEN_LIFETIME_SECONDS
  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + lifetime * 1000),
  }
}

/** Connect Link: client credentials plus the tenant host, exchanged on that host. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = (fields?.['clientId'] ?? '').trim()
  const clientSecret = fields?.['clientSecret'] ?? ''
  if (!clientId || !clientSecret) {
    throw new Error('Kibo client ID and client secret are required.')
  }
  const tenantHost = normaliseTenantHost(fields?.['tenantHost'])
  const { accessToken, expiresAt } = await fetchTenantToken(tenantHost, clientId, clientSecret)
  return { accessToken, expiresAt, extra: { tenantHost, clientId, clientSecret } }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

/**
 * Refresh credentials by re-running the client-credentials grant.
 * Returns a new Credentials object with updated accessToken and expiresAt.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error(
      'Kibo refreshCredentials requires clientId and clientSecret in credentials.extra.',
    )
  }

  const tenantHost = credentials.extra?.['tenantHost']
  const { accessToken, expiresAt } =
    typeof tenantHost === 'string' && tenantHost
      ? await fetchTenantToken(normaliseTenantHost(tenantHost), clientId, clientSecret)
      : // Connections stored before the tenant host was collected.
        await fetchToken(clientId, clientSecret)

  return {
    ...credentials,
    accessToken,
    expiresAt,
  }
}
