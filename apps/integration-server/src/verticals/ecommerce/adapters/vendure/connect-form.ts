/**
 * Connect Link form for Vendure.
 *
 * Vendure is self-hosted: the client posts GraphQL to the merchant's own Admin
 * API (`credentials.extra.apiUrl`) with `Authorization: Bearer {token}`, and
 * scopes to a channel via the `vendure-token` header when
 * `credentials.extra.channelToken` is set. The token is sent to that host on
 * every request, so the URL must be https and must resolve to a public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const API_URL_LABEL = 'Admin API URL'
const TOKEN_LABEL = 'Admin API token'
const EXAMPLE_URL = 'https://shop.example.com/admin-api'

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

export const VENDURE_FORM = customForm({
  fields: [
    {
      name: 'apiUrl',
      label: API_URL_LABEL,
      type: 'url',
      required: true,
      placeholder: EXAMPLE_URL,
      helpText:
        "Your Vendure server's Admin API endpoint. If you enter only the server address, /admin-api is added.",
    },
    {
      name: 'accessToken',
      label: TOKEN_LABEL,
      type: 'password',
      required: true,
      helpText:
        "A bearer token for an administrator: with authOptions.tokenMethod set to 'bearer', run the Admin API login mutation and copy the vendure-auth-token response header. The session stays valid while it is in use.",
    },
    {
      name: 'channelToken',
      label: 'Channel token',
      type: 'text',
      required: false,
      helpText:
        'Only for multi-channel setups: the token of the channel to connect (Settings → Channels). Leave blank for the default channel.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const rawUrl = (fields['apiUrl'] ?? '').trim()
    const accessToken = (fields['accessToken'] ?? '').trim()
    const channelToken = (fields['channelToken'] ?? '').trim()
    if (!rawUrl) throw new Error(`${API_URL_LABEL} is required.`)
    if (!accessToken) throw new Error(`${TOKEN_LABEL} is required.`)

    const url = await parsePublicHttpsUrl(rawUrl, API_URL_LABEL, EXAMPLE_URL)
    let path = url.pathname.replace(/\/+$/, '')
    if (/\/shop-api$/i.test(path)) {
      throw new Error(
        `${API_URL_LABEL} must point at the Admin API (e.g. ${EXAMPLE_URL}), not the Shop API.`,
      )
    }
    if (!path) path = '/admin-api'

    return {
      accessToken,
      extra: {
        apiUrl: `${url.origin}${path}`,
        ...(channelToken ? { channelToken } : {}),
      },
    }
  },
})
