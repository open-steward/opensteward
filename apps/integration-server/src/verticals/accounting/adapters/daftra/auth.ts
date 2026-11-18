import { customForm } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(subdomain: string): string {
  return `https://${subdomain}.daftra.com/settings/api`
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

// ── Connect Link form (API key + tenant subdomain) ──────────────────────────
//
// Every Daftra tenant is served from its own host, `{subdomain}.daftra.com`,
// and the API key is sent to that host on every request. The subdomain is
// reduced to a single DNS label here and the host is always rebuilt from that
// label with the fixed `.daftra.com` suffix, so no customer-typed host is ever
// dialled.

const DAFTRA_HOST_SUFFIX = '.daftra.com'
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const NOT_DAFTRA =
  'Daftra address must be on daftra.com — enter your subdomain, e.g. "mycompany" for https://mycompany.daftra.com.'
const BAD_LABEL =
  'Daftra subdomain must be a single name made of letters, digits and hyphens, e.g. "mycompany".'

/** True when `value` is a single DNS label usable as `{value}.daftra.com`. */
export function isDaftraSubdomain(value: unknown): value is string {
  return typeof value === 'string' && DNS_LABEL.test(value)
}

/**
 * Accepts `mycompany`, `mycompany.daftra.com` or a pasted
 * `https://mycompany.daftra.com/...` address and returns `mycompany`.
 * Anything that is not exactly one label under daftra.com is refused.
 */
export function normaliseDaftraSubdomain(raw: string): string {
  const input = raw.trim().toLowerCase()
  if (!input) throw new Error('Daftra subdomain is required.')
  if (DNS_LABEL.test(input)) return input
  if (!input.includes('.') && !input.includes('/')) throw new Error(BAD_LABEL)

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error(NOT_DAFTRA)
  }
  if (url.protocol !== 'https:') throw new Error('Daftra address must use https://.')
  if (url.username || url.password || url.port) throw new Error(NOT_DAFTRA)

  const host = url.hostname.replace(/\.$/, '')
  if (!host.endsWith(DAFTRA_HOST_SUFFIX)) throw new Error(NOT_DAFTRA)
  const label = host.slice(0, -DAFTRA_HOST_SUFFIX.length)
  if (!isDaftraSubdomain(label)) throw new Error(NOT_DAFTRA)
  return label
}

export const DAFTRA_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'subdomain',
      label: 'Daftra subdomain',
      type: 'text',
      required: true,
      placeholder: 'mycompany',
      helpText:
        'The first part of the address you sign in to Daftra at — "mycompany" for https://mycompany.daftra.com.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'Create or copy an API key in your Daftra account under Settings → API.',
    },
  ],
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Daftra API key is required.')
    const subdomain = normaliseDaftraSubdomain(input['subdomain'] ?? '')
    return { accessToken: apiKey, extra: { subdomain } }
  },
})
