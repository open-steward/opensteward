/**
 * Connect Link form for Centra.
 *
 * "Every API installed in Centra gets its own API-endpoint, which will then be
 * the prefix of every API-call" (centra.dev, Order API). The merchant copies
 * that endpoint and the API key from the Order API plugin page; the client
 * reads them from `credentials.extra.baseUrl` and `credentials.accessToken`
 * (sent as the `API-Authorization` header). The key is sent to that host on
 * every request, so the URL must be https and must resolve to a public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const BASE_URL_LABEL = 'Order API URL'
const API_KEY_LABEL = 'API key'
const EXAMPLE_URL = 'https://your-brand.centra.com/api/order-api'

async function parsePublicHttpsUrl(raw: string, label: string, example: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${label} must be a full URL, e.g. ${example}.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `${label} must start with https:// — your credentials are sent to this address on every request.`,
    )
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain a username or password.`)
  }
  if (url.search || url.hash) {
    throw new Error(`${label} must not contain a query string or fragment.`)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  try {
    await assertPublicHost(host)
  } catch (err) {
    if ((err as Error).name === 'SsrfBlockedError') {
      throw new Error(
        `${label} must be a publicly reachable host; ${host} resolves to a private or reserved address.`,
        { cause: err },
      )
    }
    throw new Error(
      `${label} host ${host} could not be resolved. Check the address and try again.`,
      { cause: err },
    )
  }
  return url
}

export const CENTRA_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: BASE_URL_LABEL,
      type: 'url',
      required: true,
      placeholder: EXAMPLE_URL,
      helpText:
        'In the Centra backend open System → Plugins → Order API and copy the API endpoint URL shown on the plugin page.',
    },
    {
      name: 'apiKey',
      label: API_KEY_LABEL,
      type: 'password',
      required: true,
      helpText:
        'The API key from the same Order API plugin page (sent as the API-Authorization header).',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const rawUrl = (fields['baseUrl'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!rawUrl) throw new Error(`${BASE_URL_LABEL} is required.`)
    if (!apiKey) throw new Error(`${API_KEY_LABEL} is required.`)

    const url = await parsePublicHttpsUrl(rawUrl, BASE_URL_LABEL, EXAMPLE_URL)
    const path = url.pathname.replace(/\/+$/, '')
    return { accessToken: apiKey, extra: { baseUrl: `${url.origin}${path}` } }
  },
})
