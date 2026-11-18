/**
 * HaloPSA auth — OAuth 2.0 client_credentials flow.
 *
 * HaloPSA is a tenant-hosted product; each customer has a unique base URL
 * (e.g. https://acme.halopsa.com, or a self-hosted domain). The token endpoint is:
 *   POST <tenantUrl>/auth/token[?tenant=<tenant>]
 *   grant_type=client_credentials&client_id=...&client_secret=...&scope=...
 *
 * Instances hosted by Halo (`*.halopsa.com`) also need the tenant name on the
 * token request; self-hosted instances do not.
 *
 * Credentials are collected via the Connect Link form (credentialFields) and
 * exchanged once for an access_token.  HaloPSA access tokens do not expire by
 * default, so refreshCredentials is a passthrough; adapters that obtain tokens
 * with a short TTL should store expires_in and re-request via this module.
 *
 * The tenant URL is customer-supplied and receives the client secret, so it is
 * normalised to an https origin and checked against private address space
 * before every token request — the first exchange and every refresh.
 */
import type { CredentialField, Credentials } from '@opensteward/shared'
import { assertPublicHost, oauth2ClientCredentials } from '@opensteward/shared'
import { AUTH_PATH, DEFAULT_SCOPES } from './constants'

const TENANT_URL_FIELD: CredentialField = {
  name: 'tenantUrl',
  label: 'HaloPSA URL',
  type: 'url',
  placeholder: 'https://yourcompany.halopsa.com',
  helpText: 'The base URL of your HaloPSA instance (no trailing slash).',
  required: true,
}

const TENANT_FIELD: CredentialField = {
  name: 'tenant',
  label: 'Tenant name (Halo-hosted only)',
  type: 'text',
  placeholder: 'yourcompany',
  helpText:
    'Only for instances hosted by Halo. Left blank, the name in yourcompany.halopsa.com is used.',
  required: false,
}

const TENANT_NAME = /^[A-Za-z0-9_-]+$/
const HALO_HOSTED = /^([a-z0-9-]+)\.halopsa\.com$/

/**
 * Reduce whatever the customer typed to the instance origin:
 * `acme.halopsa.com`, `https://Acme.HaloPSA.com/`, and a pasted
 * `https://acme.halopsa.com/tickets?view=1` all become
 * `https://acme.halopsa.com`. Rejects blanks, non-URLs, and anything but https.
 */
export function normaliseTenantUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new Error('HaloPSA URL is required (e.g. https://yourcompany.halopsa.com).')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('HaloPSA URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('HaloPSA URL must use https://.')
  if (!url.hostname) throw new Error('HaloPSA URL is not a valid URL.')
  return url.origin
}

/**
 * The tenant name for the token request: the one given, else the subdomain of
 * a Halo-hosted `*.halopsa.com` instance, else none (self-hosted).
 */
export function resolveTenant(tenantUrl: string, raw: string | undefined | null): string | undefined {
  const explicit = (raw ?? '').trim()
  if (explicit) {
    if (!TENANT_NAME.test(explicit)) {
      throw new Error('HaloPSA tenant name must contain only letters, digits, hyphens and underscores.')
    }
    return explicit
  }
  return HALO_HOSTED.exec(new URL(tenantUrl).hostname)?.[1]
}

const FORM = oauth2ClientCredentials({
  // Only ever called with a tenantUrl and tenant that `exchangeCredentials` normalised.
  tokenUrl: (input) => {
    const tenant = input['tenant']
    return `${input['tenantUrl']}${AUTH_PATH}${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`
  },
  scopes: DEFAULT_SCOPES,
  additionalFields: [TENANT_URL_FIELD, TENANT_FIELD],
  buildExtra: (input) => ({
    tenantUrl: input['tenantUrl'] ?? '',
    ...(input['tenant'] ? { tenant: input['tenant'] } : {}),
    clientId: (input['clientId'] ?? '').trim(),
    clientSecret: input['clientSecret'] ?? '',
  }),
  // Late-bound: the template otherwise captures `fetch` at module load.
  fetchImpl: (input, init) => globalThis.fetch(input, init),
})

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tenantUrl = normaliseTenantUrl(fields?.['tenantUrl'])
  const tenant = resolveTenant(tenantUrl, fields?.['tenant'])
  // The token request carries the client secret: never to a private address.
  await assertPublicHost(new URL(tenantUrl).hostname.replace(/^\[|\]$/g, ''))
  return FORM.exchangeCredentials({ ...fields, tenantUrl, tenant: tenant ?? '' })
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Re-run the client_credentials grant using the stored clientId/clientSecret.
  const extra = credentials.extra ?? {}
  const tenantUrl = String(extra['tenantUrl'] ?? '')
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  if (!tenantUrl || !clientId || !clientSecret) {
    // Cannot refresh — return existing credentials and let the next call fail.
    return credentials
  }
  return exchangeCredentials({
    tenantUrl,
    tenant: String(extra['tenant'] ?? ''),
    clientId,
    clientSecret,
  })
}
