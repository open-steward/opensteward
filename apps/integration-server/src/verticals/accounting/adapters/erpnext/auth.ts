import { assertPublicHost, customForm, SsrfBlockedError } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { ERPNEXT_DOCS_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return ERPNEXT_DOCS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code format: "apiKey:apiSecret"
  const sep = code.indexOf(':')
  if (sep === -1) return { accessToken: code }
  return {
    accessToken: code.slice(0, sep),
    extra: { apiSecret: code.slice(sep + 1) },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

// ── Connect Link form (site URL + API key + API secret) ─────────────────────
//
// ERPNext runs on the customer's own Frappe site (self-hosted or Frappe Cloud)
// and the `token <key>:<secret>` header travels there on every request. The
// site URL must therefore be https and resolve only to public addresses before
// it is stored. Frappe serves a site from its domain root, so only the origin
// is kept.

const URL_LABEL = 'ERPNext site URL'

function parseSiteUrl(input: string): URL {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${URL_LABEL} must be a full web address, e.g. https://mycompany.erpnext.com.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${URL_LABEL} must use https:// — the API key and secret are sent with every request.`)
  }
  if (url.username || url.password) {
    throw new Error(`${URL_LABEL} must not include a username or password.`)
  }
  return url
}

async function assertReachable(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
  try {
    await assertPublicHost(host)
  } catch (err) {
    if (err instanceof SsrfBlockedError && err.address !== '(no address)') {
      throw new Error(
        `${URL_LABEL} must be publicly reachable — ${host} resolves to a private or reserved network address.`,
        { cause: err },
      )
    }
    throw new Error(`${URL_LABEL} host ${host} could not be resolved — check the address.`, { cause: err })
  }
}

/** Returns the REST resource base for a site, e.g. `https://acme.erpnext.com/api/resource/`. */
export async function normaliseErpNextApiBase(raw: string): Promise<string> {
  const url = parseSiteUrl(raw.trim())
  await assertReachable(url)
  return `${url.origin}/api/resource/`
}

export const ERPNEXT_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'siteUrl',
      label: URL_LABEL,
      type: 'url',
      required: true,
      placeholder: 'https://mycompany.erpnext.com',
      helpText:
        'The https address of your ERPNext site, self-hosted or on Frappe Cloud (e.g. https://mycompany.frappe.cloud).',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'text',
      required: true,
      helpText:
        'In ERPNext open the user the integration acts as → Settings → API Access → Generate Keys, then copy the API Key.',
    },
    {
      name: 'apiSecret',
      label: 'API secret',
      type: 'password',
      required: true,
      helpText: 'Shown once, next to the API key, when the keys are generated.',
    },
  ],
  async exchange(input): Promise<Credentials> {
    const rawUrl = (input['siteUrl'] ?? '').trim()
    const apiKey = (input['apiKey'] ?? '').trim()
    const apiSecret = (input['apiSecret'] ?? '').trim()
    if (!rawUrl) throw new Error(`${URL_LABEL} is required.`)
    if (!apiKey) throw new Error('ERPNext API key is required.')
    if (!apiSecret) throw new Error('ERPNext API secret is required.')
    const baseUrl = await normaliseErpNextApiBase(rawUrl)
    return { accessToken: apiKey, extra: { apiSecret, baseUrl } }
  },
})
