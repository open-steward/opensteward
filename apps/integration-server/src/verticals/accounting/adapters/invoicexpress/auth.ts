import { customForm } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'

// InvoiceXpress uses a static API key — no OAuth flow.
// The "auth URL" just instructs users to get the key from their account settings.

export function buildAuthUrl(_state: string): string {
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is the api_key provided by the user
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is
  return credentials
}

// ── Connect Link form (API key + account name) ──────────────────────────────
//
// Every InvoiceXpress account is served from `{account}.app.invoicexpress.com`
// and the API key travels to that host on every request. The account name is
// reduced to a single DNS label here; the host is always rebuilt from it with
// the fixed suffix, so no customer-typed host is ever dialled.

const INVOICEXPRESS_HOST_SUFFIX = '.app.invoicexpress.com'
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const NOT_INVOICEXPRESS =
  'InvoiceXpress address must be on app.invoicexpress.com — enter your account name, e.g. "mycompany" for https://mycompany.app.invoicexpress.com.'
const BAD_LABEL =
  'InvoiceXpress account name must be a single name made of letters, digits and hyphens, e.g. "mycompany".'

/** True when `value` is a single DNS label usable as `{value}.app.invoicexpress.com`. */
export function isInvoiceXpressAccountName(value: unknown): value is string {
  return typeof value === 'string' && DNS_LABEL.test(value)
}

/**
 * Accepts `mycompany`, `mycompany.app.invoicexpress.com` or a pasted
 * `https://mycompany.app.invoicexpress.com/...` address and returns
 * `mycompany`. Anything that is not exactly one label under
 * app.invoicexpress.com is refused.
 */
export function normaliseInvoiceXpressAccountName(raw: string): string {
  const input = raw.trim().toLowerCase()
  if (!input) throw new Error('InvoiceXpress account name is required.')
  if (DNS_LABEL.test(input)) return input
  if (!input.includes('.') && !input.includes('/')) throw new Error(BAD_LABEL)

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error(NOT_INVOICEXPRESS)
  }
  if (url.protocol !== 'https:') throw new Error('InvoiceXpress address must use https://.')
  if (url.username || url.password || url.port) throw new Error(NOT_INVOICEXPRESS)

  const host = url.hostname.replace(/\.$/, '')
  if (!host.endsWith(INVOICEXPRESS_HOST_SUFFIX)) throw new Error(NOT_INVOICEXPRESS)
  const label = host.slice(0, -INVOICEXPRESS_HOST_SUFFIX.length)
  if (!isInvoiceXpressAccountName(label)) throw new Error(NOT_INVOICEXPRESS)
  return label
}

export const INVOICEXPRESS_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'accountName',
      label: 'Account name',
      type: 'text',
      required: true,
      placeholder: 'mycompany',
      helpText:
        'The first part of your InvoiceXpress address — "mycompany" in https://mycompany.app.invoicexpress.com.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'In InvoiceXpress open Settings → API and copy the API key.',
    },
  ],
  async exchange(input): Promise<Credentials> {
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('InvoiceXpress API key is required.')
    const accountName = normaliseInvoiceXpressAccountName(input['accountName'] ?? '')
    return { accessToken: apiKey, extra: { accountName } }
  },
})
