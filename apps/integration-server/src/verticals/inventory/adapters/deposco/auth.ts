/**
 * Deposco WMS auth — HTTP Basic Auth with instance host, tenant code, username
 * and password.
 *
 * The integration API lives at `https://{instance}.deposco.com/integration/{tenantCode}`.
 * The instance host and the tenant code are separate values issued by the
 * Deposco account manager (integrators ask for "Deposco URL" and "Tenant Code"
 * independently), so both are collected. There is no OAuth redirect: the
 * Connect page collects them via credentialFields(), which it renders for
 * `basic`, not `oauth2`.
 *
 * Credentials are stored as: accessToken = base64(username:password),
 * extra.instance = normalised *.deposco.com subdomain, extra.tenantCode,
 * extra.businessUnit (default DEFAULT).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { DEFAULT_BUSINESS_UNIT } from './constants'

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const TENANT_CODE = /^[A-Za-z0-9_-]+$/

export function getAuthUrlUnsupported(): never {
  throw new Error('deposco uses HTTP Basic Auth; use credentialFields() instead')
}

/**
 * Reduce what a customer typed for their Deposco URL — `acme`,
 * `acme.deposco.com`, `https://acme.deposco.com/integration/ACME` — to the bare
 * lower-case subdomain. Rejects blanks and anything outside deposco.com,
 * because the Basic credentials are sent to this host.
 */
export function normaliseDeposcoInstance(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error('Deposco URL is required (e.g. acme.deposco.com).')
  const outside = () => new Error('Deposco URL must be a *.deposco.com host.')
  if (s.includes('.') && !s.endsWith('.deposco.com')) throw outside()
  const sub = s.replace(/\.deposco\.com$/, '')
  if (!DNS_LABEL.test(sub)) throw outside()
  return sub
}

/** The tenant code is a path segment of every request, so it must be a single code. */
export function normaliseDeposcoTenantCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.trim() : ''
  if (!code) throw new Error('Deposco tenant code is required.')
  if (!TENANT_CODE.test(code)) {
    throw new Error('Deposco tenant code must be a single code (letters, digits, - or _).')
  }
  return code
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'deposcoUrl',
      label: 'Deposco URL',
      type: 'text',
      placeholder: 'acme.deposco.com',
      helpText: 'The *.deposco.com host from your Deposco account manager. A pasted https:// URL is accepted.',
      required: true,
    },
    {
      name: 'tenantCode',
      label: 'Tenant Code',
      type: 'text',
      helpText: 'Appears in API paths as /integration/{tenant code}.',
      required: true,
    },
    { name: 'username', label: 'API Username', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
    { name: 'businessUnit', label: 'Business Unit', type: 'text', required: false },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const instance = normaliseDeposcoInstance(fields['deposcoUrl'])
  const tenantCode = normaliseDeposcoTenantCode(fields['tenantCode'])
  const username = (fields['username'] ?? '').trim()
  const password = fields['password'] ?? ''
  const businessUnit = (fields['businessUnit'] ?? '').trim() || DEFAULT_BUSINESS_UNIT

  if (!username) throw new Error('API username is required.')
  if (!password) throw new Error('API password is required.')

  // Store base64(username:password) as accessToken; host and tenant details in extra
  return {
    accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
    extra: { instance, tenantCode, businessUnit },
  }
}
