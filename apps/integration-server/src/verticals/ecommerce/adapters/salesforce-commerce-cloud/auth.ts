/**
 * Salesforce Commerce Cloud B2C Commerce API (SCAPI) OAuth2 helpers.
 *
 * SCAPI has two separate auth flows:
 *
 * 1. **Admin API** — Account Manager (account.demandware.com).
 *    Uses `client_credentials` grant with HTTP Basic auth (clientId:clientSecret)
 *    and a space-separated scope list in the request body.
 *    Tokens are short-lived (~30 min); `refreshCredentials` re-fetches them.
 *
 * 2. **Shopper API** — SLAS (Shopper Login and Authorization Service).
 *    Uses `authorization_code` for registered shoppers.
 *
 * For this integration adapter we target the **Admin API** because it provides
 * full read/write access to products, orders, customers, inventory, and
 * promotions — mapping most closely to the canonical ecommerce interface.
 *
 * Docs:
 *   Admin: https://developer.salesforce.com/docs/commerce/commerce-api/guide/authorization-for-admin-apis.html
 *   SLAS:  https://developer.salesforce.com/docs/commerce/commerce-api/guide/authorization-for-shopper-apis.html
 */

import axios from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { ACCOUNT_MANAGER_TOKEN_URL, DEFAULT_ADMIN_SCOPES } from './constants'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountManagerTokenResponse {
  access_token: string
  token_type: string
  expires_in: number // seconds
  scope?: string
}

interface SlasTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
  refresh_token?: string
}

// ── Admin API — Account Manager client_credentials ────────────────────────────

/**
 * Request a short-lived JWT from Account Manager using the
 * `client_credentials` grant.  The returned `Credentials` object carries
 * `expiresAt` so the shared `isTokenExpired` helper can trigger a refresh.
 */
export async function requestAdminToken(
  clientId: string,
  clientSecret: string,
  scopes: string[] = DEFAULT_ADMIN_SCOPES,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: scopes.join(' '),
  })

  const { data } = await axios.post<AccountManagerTokenResponse>(
    ACCOUNT_MANAGER_TOKEN_URL,
    body.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      timeout: 15_000,
    },
  )

  return {
    accessToken: data.access_token,
    scope: data.scope,
    // Store expiry slightly early (30 s buffer) to avoid using a token that
    // expires mid-request.
    expiresAt: new Date(Date.now() + (data.expires_in - 30) * 1000),
  }
}

// ── Shopper API — SLAS authorization_code ─────────────────────────────────────

/**
 * Build the SLAS authorization URL for registered-shopper flows.
 */
export function buildAuthUrl(
  shortCode: string,
  organizationId: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const base =
    `https://${shortCode}.api.commercecloud.salesforce.com` +
    `/shopper/auth/v1/organizations/${organizationId}/oauth2/authorize`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  })
  return `${base}?${params.toString()}`
}

/**
 * Exchange an authorization_code for a SLAS shopper token.
 */
export async function exchangeCode(
  shortCode: string,
  organizationId: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const tokenUrl =
    `https://${shortCode}.api.commercecloud.salesforce.com` +
    `/shopper/auth/v1/organizations/${organizationId}/oauth2/token`

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
  })

  const { data } = await axios.post<SlasTokenResponse>(tokenUrl, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    timeout: 15_000,
  })

  return {
    accessToken: data.access_token,
    scope: data.scope,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in - 30) * 1000),
  }
}

/**
 * Refresh an expired SLAS shopper token using a refresh_token, or fall back
 * to a new Admin client_credentials token when no refresh_token is available.
 */
export async function refreshToken(
  shortCode: string,
  organizationId: string,
  clientId: string,
  clientSecret: string,
  credentials: Credentials,
): Promise<Credentials> {
  if (credentials.refreshToken) {
    const tokenUrl =
      `https://${shortCode}.api.commercecloud.salesforce.com` +
      `/shopper/auth/v1/organizations/${organizationId}/oauth2/token`

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
    })

    const { data } = await axios.post<SlasTokenResponse>(tokenUrl, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      timeout: 15_000,
    })

    return {
      accessToken: data.access_token,
      scope: data.scope,
      refreshToken: data.refresh_token ?? credentials.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in - 30) * 1000),
    }
  }

  // No refresh token — re-issue an admin client_credentials token.
  return requestAdminToken(clientId, clientSecret)
}

// ── Connect Link — SLAS client_credentials on the merchant's instance ─────────

/**
 * Every SCAPI URL is on the merchant's `{shortCode}` host and carries their
 * organization ID; Shopper APIs also need the site ID. All are the customer's,
 * so they are collected on the credential form alongside a private SLAS
 * client's ID and secret, and stored in `credentials.extra`.
 */
export interface ScapiInstance {
  shortCode: string
  organizationId: string
  siteId: string
  clientId: string
  clientSecret: string
}

const SCAPI_HOST_SUFFIX = '.api.commercecloud.salesforce.com'

/** `kv7kzm78`, `kv7kzm78.api.commercecloud.salesforce.com`, or a pasted SCAPI URL → `kv7kzm78`. */
export function normaliseShortCode(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#:].*$/, '')
  if (!value) throw new Error('Salesforce Commerce Cloud short code is required.')
  const code = value.endsWith(SCAPI_HOST_SUFFIX) ? value.slice(0, -SCAPI_HOST_SUFFIX.length) : value
  if (!/^[a-z0-9]+$/.test(code)) {
    throw new Error(
      'Salesforce Commerce Cloud short code must be the code from {shortCode}.api.commercecloud.salesforce.com.',
    )
  }
  return code
}

/** `F_ECOM_ZZTE_053` → `f_ecom_zzte_053`; anything not of that shape is refused. */
export function normaliseOrganizationId(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '').trim().toLowerCase()
  if (!value) throw new Error('Salesforce Commerce Cloud organization ID is required.')
  if (!/^f_ecom_[a-z0-9]+_[a-z0-9]+$/.test(value)) {
    throw new Error('Salesforce Commerce Cloud organization ID must look like f_ecom_zzte_053.')
  }
  return value
}

export function normaliseSiteId(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '').trim()
  if (!value) throw new Error('Salesforce Commerce Cloud site ID is required.')
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(
      'Salesforce Commerce Cloud site ID must contain only letters, digits, hyphens and underscores.',
    )
  }
  return value
}

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'SLAS client ID',
    type: 'text',
    required: true,
    helpText: 'A private SLAS client registered for this site.',
  },
  { name: 'clientSecret', label: 'SLAS client secret', type: 'password', required: true },
  {
    name: 'shortCode',
    label: 'Short code',
    type: 'text',
    required: true,
    placeholder: 'kv7kzm78',
    helpText: 'From your SCAPI base URL: {shortCode}.api.commercecloud.salesforce.com.',
  },
  {
    name: 'organizationId',
    label: 'Organization ID',
    type: 'text',
    required: true,
    placeholder: 'f_ecom_zzte_053',
  },
  { name: 'siteId', label: 'Site ID', type: 'text', required: true, placeholder: 'RefArch' },
]

export function slasTokenUrl(shortCode: string, organizationId: string): string {
  return (
    `https://${shortCode}${SCAPI_HOST_SUFFIX}` +
    `/shopper/auth/v1/organizations/${organizationId}/oauth2/token`
  )
}

/** A SLAS token for the site via the private client's `client_credentials` grant. */
export async function requestShopperToken(instance: ScapiInstance): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    channel_id: instance.siteId,
  })
  const basic = Buffer.from(`${instance.clientId}:${instance.clientSecret}`).toString('base64')
  const { data } = await axios.post<SlasTokenResponse>(
    slasTokenUrl(instance.shortCode, instance.organizationId),
    body.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
      },
      timeout: 15_000,
    },
  )
  return {
    accessToken: data.access_token,
    scope: data.scope,
    refreshToken: data.refresh_token,
    expiresAt:
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + (data.expires_in - 30) * 1000)
        : undefined,
    extra: { ...instance },
  }
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = (fields?.['clientId'] ?? '').trim()
  const clientSecret = fields?.['clientSecret'] ?? ''
  if (!clientId || !clientSecret) {
    throw new Error('Salesforce Commerce Cloud client ID and client secret are required.')
  }
  return requestShopperToken({
    shortCode: normaliseShortCode(fields?.['shortCode']),
    organizationId: normaliseOrganizationId(fields?.['organizationId']),
    siteId: normaliseSiteId(fields?.['siteId']),
    clientId,
    clientSecret,
  })
}
