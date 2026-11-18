/**
 * Connect Link form for Drupal Commerce.
 *
 * Drupal Commerce is self-hosted, so the client needs the merchant's own site
 * URL (`credentials.extra.baseUrl`) as well as a bearer token. The token is sent
 * to that host on every request, so the URL must be https and must resolve to a
 * public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const SITE_URL_LABEL = 'Drupal site URL'
const TOKEN_LABEL = 'Access token'

/**
 * Parse a customer-typed URL and require https + a public host. Returns the
 * parsed URL; callers build the stored value from `origin` + a normalised path.
 */
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

export const DRUPAL_COMMERCE_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: SITE_URL_LABEL,
      type: 'url',
      required: true,
      placeholder: 'https://shop.example.com',
      helpText:
        'The public address of your Drupal Commerce site, without /jsonapi. The core JSON:API module must be enabled.',
    },
    {
      name: 'accessToken',
      label: TOKEN_LABEL,
      type: 'password',
      required: true,
      helpText:
        'A bearer token for a Drupal user allowed to manage Commerce data, e.g. issued by the Simple OAuth module (POST /oauth/token). Give it a long lifetime: the connection stops working when the token expires.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const rawUrl = (fields['baseUrl'] ?? '').trim()
    const accessToken = (fields['accessToken'] ?? '').trim()
    if (!rawUrl) throw new Error(`${SITE_URL_LABEL} is required.`)
    if (!accessToken) throw new Error(`${TOKEN_LABEL} is required.`)

    const url = await parsePublicHttpsUrl(rawUrl, SITE_URL_LABEL, 'https://shop.example.com')
    // The client appends /jsonapi itself — accept a pasted JSON:API URL too.
    const path = url.pathname
      .replace(/\/+$/, '')
      .replace(/\/jsonapi$/i, '')
      .replace(/\/+$/, '')
    return { accessToken, extra: { baseUrl: `${url.origin}${path}` } }
  },
})
