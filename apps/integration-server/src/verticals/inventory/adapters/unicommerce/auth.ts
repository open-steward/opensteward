/**
 * Unicommerce auth — OAuth2 password-grant flow.
 *
 * Credentials fields collected from the user:
 *   - tenant    : Unicommerce subdomain (e.g. "mycompany" → mycompany.unicommerce.com)
 *   - username  : Unicommerce admin username (email)
 *   - password  : Unicommerce admin password
 *   - facility  : (optional) default facility/warehouse code for facility-level APIs
 *
 * There is no browser redirect, so the platform's correct auth_type is not
 * `oauth2` (the Connect page renders `credentialFields()` only for non-oauth2
 * auth types). exchangeCredentials calls the tenant's OAuth2 endpoint, stores
 * the bearer token as accessToken, and stashes the normalised tenant +
 * refreshToken + facility in extra.
 *
 * The token endpoint is Spring Security OAuth2's `/oauth/token`, which always
 * accepts a form-encoded POST. We POST so the user's password travels in the
 * request body and never in a URL (URLs end up in proxy and error logs).
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { tenantBaseUrl, OAUTH_CLIENT_ID } from './constants'

const UNICOMMERCE_SUFFIX = '.unicommerce.com'
const SUBDOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Reduce whatever a customer typed for their tenant to the bare subdomain:
 * `acme`, `acme.unicommerce.com` and `https://acme.unicommerce.com/...` all
 * become `acme`. The password and bearer token go to this host, so anything
 * outside `*.unicommerce.com` is rejected.
 */
export function normaliseTenant(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) {
    throw new Error('Unicommerce tenant is required (e.g. mycompany for mycompany.unicommerce.com).')
  }
  let sub = s
  if (s.includes('.') || s.includes(':')) {
    if (!s.endsWith(UNICOMMERCE_SUFFIX)) {
      throw new Error('Unicommerce tenant must be a *.unicommerce.com host.')
    }
    sub = s.slice(0, -UNICOMMERCE_SUFFIX.length)
    if (!sub || sub.includes('.')) {
      throw new Error('Unicommerce tenant must be a *.unicommerce.com host.')
    }
  }
  if (!SUBDOMAIN_LABEL.test(sub)) {
    throw new Error('Unicommerce tenant may only contain letters, digits and hyphens.')
  }
  return sub
}

export function getAuthUrlUnsupported(): never {
  throw new Error('unicommerce uses OAuth2 password-grant; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenant',
      label: 'Unicommerce tenant',
      type: 'text',
      required: true,
      placeholder: 'mycompany',
      helpText: 'The subdomain you sign in at — mycompany for mycompany.unicommerce.com.',
    },
    { name: 'username', label: 'Unicommerce username (email)', type: 'text', required: true },
    { name: 'password', label: 'Unicommerce password', type: 'password', required: true },
    {
      name: 'facility',
      label: 'Default facility code (optional)',
      type: 'text',
      required: false,
      helpText:
        'Sent as the Facility header on facility-level APIs (inventory snapshots, purchase-order details, gatepasses).',
    },
  ]
}

interface OAuthTokenResponse {
  access_token: string
  token_type: string
  refresh_token?: string
  expires_in?: number
}

function expiresAtFrom(expiresIn: number | undefined): Date | undefined {
  return typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000) : undefined
}

async function requestToken(
  tenant: string,
  params: Record<string, string>,
): Promise<OAuthTokenResponse> {
  const { data } = await axios.post<OAuthTokenResponse>(
    `${tenantBaseUrl(tenant)}/oauth/token`,
    new URLSearchParams({ client_id: OAUTH_CLIENT_ID, ...params }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  return data
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tenant = normaliseTenant(fields['tenant'])
  const username = (fields['username'] ?? '').trim()
  const password = fields['password'] ?? ''
  const facility = (fields['facility'] ?? '').trim()

  if (!username) throw new Error('Unicommerce username is required.')
  if (!password) throw new Error('Unicommerce password is required.')

  const data = await requestToken(tenant, { grant_type: 'password', username, password })

  if (!data.access_token) {
    throw new Error('unicommerce OAuth2 token exchange returned no access_token')
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: expiresAtFrom(data.expires_in),
    extra: {
      tenant,
      facility,
      refreshToken: data.refresh_token ?? '',
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const rawTenant = credentials.extra?.['tenant']
  const refreshToken = String(credentials.refreshToken ?? credentials.extra?.['refreshToken'] ?? '')
  const facility = String(credentials.extra?.['facility'] ?? '')

  if (!rawTenant || !refreshToken) {
    // Cannot refresh without tenant/token — return as-is and let caller re-auth
    return credentials
  }
  // Throws on a stored tenant outside unicommerce.com: never send the token elsewhere.
  const tenant = normaliseTenant(rawTenant)

  try {
    const data = await requestToken(tenant, { grant_type: 'refresh_token', refresh_token: refreshToken })
    const nextRefresh = data.refresh_token ?? refreshToken
    return {
      accessToken: data.access_token,
      refreshToken: nextRefresh,
      expiresAt: expiresAtFrom(data.expires_in),
      extra: { tenant, facility, refreshToken: nextRefresh },
    }
  } catch {
    return credentials
  }
}
