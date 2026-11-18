import { customForm, type CredentialField } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { MAXIO_SETTINGS_URL, MAXIO_SUBDOMAIN_PATTERN } from './constants'

// Maxio uses API keys generated from the Maxio settings panel.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return MAXIO_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Maxio API keys don't expire — return as-is
  return credentials
}

// ── Connect Link form ────────────────────────────────────────────────────────
//
// Every Advanced Billing site is served at https://{subdomain}.chargify.com/
// and the API key is sent there (HTTP Basic) on every request, so only a
// single-label chargify.com subdomain is accepted.

const CHARGIFY_SUFFIX = '.chargify.com'

const FIELDS: CredentialField[] = [
  {
    name: 'subdomain',
    label: 'Site subdomain',
    type: 'text',
    required: true,
    placeholder: 'acme',
    helpText:
      'The first part of your Maxio Advanced Billing site address — "acme" in acme.chargify.com. Pasting the full address also works.',
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText:
      'In Advanced Billing: Config → Integrations → API Keys → New API Key. Keys belong to a single site.',
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

/** Accepts `acme`, `acme.chargify.com` or a pasted site URL; returns `acme`. */
export function normaliseSubdomain(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) throw new Error('Site subdomain is required.')
  const host = hostOf(value)
  const label = host.endsWith(CHARGIFY_SUFFIX) ? host.slice(0, -CHARGIFY_SUFFIX.length) : host
  if (!MAXIO_SUBDOMAIN_PATTERN.test(label)) {
    throw new Error(
      `Site subdomain must be your Advanced Billing subdomain, such as acme or acme.chargify.com; "${host}" is not a chargify.com site.`,
    )
  }
  return label
}

export const CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const subdomain = normaliseSubdomain(input['subdomain'])
    return { accessToken: apiKey, extra: { subdomain } }
  },
})
