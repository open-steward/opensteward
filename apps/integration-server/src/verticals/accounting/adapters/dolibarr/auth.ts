import { assertPublicHost, customForm, SsrfBlockedError } from '@opensteward/shared'
import type { Credentials } from '../../adapter/interface'
import { DOLIBARR_SETTINGS_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return DOLIBARR_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

// ── Connect Link form (instance URL + DOLAPIKEY) ────────────────────────────
//
// Dolibarr is self-hosted: the REST API is served from `<instance>/api/index.php/`
// on the customer's own server, and the DOLAPIKEY header travels there on every
// request. The instance URL must therefore be https and resolve only to public
// addresses before it is stored.

const URL_LABEL = 'Dolibarr URL'

function parseInstanceUrl(input: string): URL {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${URL_LABEL} must be a full web address, e.g. https://erp.example.com.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${URL_LABEL} must use https:// — the API key is sent with every request.`)
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

/**
 * Accepts the address the customer opens Dolibarr at (optionally under a
 * sub-path, or a pasted `/index.php` or `/api/index.php/...` URL) and returns
 * the REST API base, e.g. `https://erp.example.com/dolibarr/api/index.php/`.
 */
export async function normaliseDolibarrApiBase(raw: string): Promise<string> {
  const url = parseInstanceUrl(raw.trim())
  await assertReachable(url)
  let path = url.pathname
  const apiSegment = path.search(/\/api(?:\/|$)/i)
  if (apiSegment !== -1) path = path.slice(0, apiSegment)
  path = path.replace(/\/index\.php$/i, '').replace(/\/+$/, '')
  return `${url.origin}${path}/api/index.php/`
}

export const DOLIBARR_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: URL_LABEL,
      type: 'url',
      required: true,
      placeholder: 'https://erp.example.com',
      helpText:
        'The https address you open Dolibarr at, including any sub-path (e.g. https://example.com/dolibarr). The "API REST" module must be enabled under Home → Setup → Modules.',
    },
    {
      name: 'apiKey',
      label: 'API key (DOLAPIKEY)',
      type: 'password',
      required: true,
      helpText:
        'Open Users & Groups → the user the integration should act as → Modify, then generate or copy the "API key" field.',
    },
  ],
  async exchange(input): Promise<Credentials> {
    const rawUrl = (input['baseUrl'] ?? '').trim()
    const apiKey = (input['apiKey'] ?? '').trim()
    if (!rawUrl) throw new Error(`${URL_LABEL} is required.`)
    if (!apiKey) throw new Error('Dolibarr API key is required.')
    const baseUrl = await normaliseDolibarrApiBase(rawUrl)
    return { accessToken: apiKey, extra: { baseUrl } }
  },
})
