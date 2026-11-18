/**
 * Tecsys OrderDynamics OAuth2 authentication helpers.
 *
 * Tecsys OrderDynamics is secured via Azure Active Directory. Integrations
 * use the OAuth2 client_credentials grant: the customer creates an Azure App
 * Registration, grants it access to the OrderDynamics resource, and supplies
 * the tenant_id, client_id, and client_secret here. The Azure API Management
 * gateway in front of the API also issues a per-subscription key, collected
 * here and sent by the client as `Ocp-Apim-Subscription-Key`.
 *
 * There is no browser-based authorization code flow for server integrations,
 * so the platform's correct auth_type is `oauth2_cc` — the Connect page renders
 * `credentialFields()` only for non-oauth2 auth types.
 *
 * The API host is fixed (api.orderdynamics.net). The tenant is the only
 * per-customer URL component: a path segment of the fixed Microsoft token URL.
 * Token lifetime is typically 3600 s; we store expiresAt and re-issue via
 * refreshCredentials() when the token is within 60 s of expiry.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL_TEMPLATE, DEFAULT_SCOPE } from './constants'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const LOGIN_PREFIX = 'https://login.microsoftonline.com/'

/**
 * Accepts a directory (tenant) GUID, a verified domain such as
 * `contoso.onmicrosoft.com`, or a pasted `login.microsoftonline.com/{tenant}/…`
 * URL, and returns the lower-cased tenant. `common` / `organizations` /
 * `consumers` are rejected: client_credentials needs a concrete tenant.
 */
export function normaliseTenantId(raw: unknown): string {
  let s = (typeof raw === 'string' ? raw : '').trim().toLowerCase()
  if (s.startsWith(LOGIN_PREFIX)) s = s.slice(LOGIN_PREFIX.length).split('/')[0] ?? ''
  if (!s) throw new Error('Azure tenant ID is required.')
  if (!GUID.test(s) && !DOMAIN.test(s)) {
    throw new Error(
      'Azure tenant ID must be a directory (tenant) GUID or a verified domain such as contoso.onmicrosoft.com.',
    )
  }
  return s
}

function tokenUrl(tenantId: string): string {
  return TOKEN_URL_TEMPLATE.replace('{tenantId}', encodeURIComponent(tenantId))
}

interface AzureTokenResponse {
  access_token?: string
  expires_in?: number
  token_type?: string
  [key: string]: unknown
}

export function getAuthUrl(_state: string, _scopes?: string[]): string {
  throw new Error(
    'tecsys: uses OAuth2 client_credentials (Azure AD); no browser authorization URL — use credentialFields() instead',
  )
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenantId',
      label: 'Azure Tenant ID',
      type: 'text',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      helpText: 'The Azure Active Directory tenant (directory) ID for your organisation.',
      required: true,
    },
    {
      name: 'clientId',
      label: 'Client ID (Application ID)',
      type: 'text',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      helpText: 'The Application (client) ID of the Azure App Registration.',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      helpText: 'A client secret generated under Certificates & Secrets in your App Registration.',
      required: true,
    },
    {
      name: 'subscriptionKey',
      label: 'API subscription key',
      type: 'password',
      helpText:
        'Your OrderDynamics developer-portal subscription key (Profile → Subscription details). Leave blank only if Tecsys has not issued one.',
      required: false,
    },
  ]
}

/** Client-credentials grant — called when the credentialFields() form is submitted. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tenantId = normaliseTenantId(fields['tenantId'])
  const clientId = (fields['clientId'] ?? '').trim()
  const clientSecret = fields['clientSecret'] ?? ''
  const subscriptionKey = (fields['subscriptionKey'] ?? '').trim()
  if (!clientId) throw new Error('Azure client ID is required.')
  if (!clientSecret) throw new Error('Azure client secret is required.')

  const { data } = await axios.post<AzureTokenResponse>(
    tokenUrl(tenantId),
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: DEFAULT_SCOPE,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  const accessToken = data.access_token ?? ''
  if (!accessToken) throw new Error('tecsys: no access_token in Azure AD response')
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600

  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: { tenantId, clientId, clientSecret, ...(subscriptionKey ? { subscriptionKey } : {}) },
  }
}

/** Re-issue a client_credentials token when the stored one is near expiry. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const tenantId = String(credentials.extra?.['tenantId'] ?? '')
  const clientId = String(credentials.extra?.['clientId'] ?? '')
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
  const subscriptionKey = String(credentials.extra?.['subscriptionKey'] ?? '')
  if (!tenantId || !clientId || !clientSecret) return credentials
  return exchangeCredentials({ tenantId, clientId, clientSecret, subscriptionKey })
}
