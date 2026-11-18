/**
 * Freshsales Connect Link form.
 *
 * Freshsales serves each account at its own bundle alias, and the API key is
 * sent to it (`Authorization: Token token=…`) on every request, so the domain
 * is collected per customer and only genuine Freshworks hosts are accepted:
 *
 *   {domain}.myfreshworks.com/crm/sales/api   current bundle alias
 *   {domain}.freshworks.com/crm/sales/api     legacy bundle alias
 *   {domain}.freshsales.io/api                older standalone accounts
 *
 * Docs: https://developers.freshworks.com/crm/api/
 */
import { customForm, type CredentialField, type Credentials } from '@opensteward/shared'

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const ACCOUNT_HOSTS: ReadonlyArray<{ suffix: string; apiPath: string }> = [
  { suffix: '.myfreshworks.com', apiPath: '/crm/sales/api' },
  { suffix: '.freshworks.com', apiPath: '/crm/sales/api' },
  { suffix: '.freshsales.io', apiPath: '/api' },
]

const FIELDS: CredentialField[] = [
  {
    name: 'domain',
    label: 'Freshsales domain',
    type: 'text',
    required: true,
    placeholder: 'acme.myfreshworks.com',
    helpText:
      'The address in your browser when signed in to Freshsales, e.g. acme.myfreshworks.com (older accounts: acme.freshsales.io). Entering just "acme" assumes acme.myfreshworks.com.',
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText: 'In Freshsales: your profile picture → Settings → API Settings → copy "Your API key".',
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

/** Accepts `acme`, a full account host, or a pasted Freshsales URL. */
export function normaliseFreshsalesDomain(raw: string | undefined): {
  domain: string
  baseUrl: string
} {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) throw new Error('Freshsales domain is required.')
  const parsed = hostOf(value)
  const host = parsed.includes('.') ? parsed : `${parsed}.myfreshworks.com`
  for (const { suffix, apiPath } of ACCOUNT_HOSTS) {
    if (host.endsWith(suffix) && LABEL_PATTERN.test(host.slice(0, -suffix.length))) {
      return { domain: host, baseUrl: `https://${host}${apiPath}` }
    }
  }
  throw new Error(
    `Freshsales domain must be a myfreshworks.com, freshworks.com or freshsales.io address such as acme.myfreshworks.com; "${parsed}" is not.`,
  )
}

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const { domain, baseUrl } = normaliseFreshsalesDomain(input['domain'])
    return { accessToken: apiKey, extra: { domain, baseUrl } }
  },
})
