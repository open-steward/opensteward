/**
 * weclapp Connect Link form.
 *
 * weclapp serves each tenant at https://{tenant}.weclapp.com/webapp/api/v1 and
 * the API token is sent to that host (`AuthenticationToken` header) on every
 * request, so the tenant is collected per customer and only a single-label
 * weclapp.com tenant is accepted.
 *
 * Docs: https://www.weclapp.com/api/
 */
import { customForm, type CredentialField, type Credentials } from '@opensteward/shared'

const WECLAPP_SUFFIX = '.weclapp.com'
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const FIELDS: CredentialField[] = [
  {
    name: 'tenant',
    label: 'weclapp tenant',
    type: 'text',
    required: true,
    placeholder: 'acme.weclapp.com',
    helpText:
      'The address you sign in to weclapp at, e.g. acme.weclapp.com (just "acme" also works).',
  },
  {
    name: 'apiKey',
    label: 'API token',
    type: 'password',
    required: true,
    helpText: 'In weclapp: your user menu → My settings → API token.',
  },
]

function hostOf(value: string): string {
  if (value.includes('://')) {
    try {
      return new URL(value).hostname
    } catch {
      return value
    }
  }
  return value.split(/[/?#]/)[0] ?? ''
}

/** Accepts `acme`, `acme.weclapp.com` or a pasted weclapp URL; returns the tenant API base. */
export function normaliseWeclappTenant(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) throw new Error('weclapp tenant is required.')
  const parsed = hostOf(value)
  const host = parsed.includes('.') ? parsed : `${parsed}${WECLAPP_SUFFIX}`
  const tenant = host.endsWith(WECLAPP_SUFFIX) ? host.slice(0, -WECLAPP_SUFFIX.length) : ''
  if (!LABEL_PATTERN.test(tenant)) {
    throw new Error(
      `weclapp tenant must be your weclapp.com address such as acme.weclapp.com; "${parsed}" is not a weclapp.com tenant.`,
    )
  }
  return `https://${tenant}${WECLAPP_SUFFIX}/webapp/api/v1`
}

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API token is required.')
    const instanceUrl = normaliseWeclappTenant(input['tenant'])
    return { accessToken: apiKey, extra: { instanceUrl } }
  },
})
