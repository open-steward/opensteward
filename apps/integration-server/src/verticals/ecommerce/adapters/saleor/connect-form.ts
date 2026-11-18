/**
 * Connect Link form for Saleor.
 *
 * Every Saleor store — Saleor Cloud (`https://{store}.saleor.cloud/graphql/`)
 * or self-hosted — has its own GraphQL endpoint. The client reads it from
 * `credentials.extra.apiUrl`, sends `Authorization: Bearer {App token}`, and
 * scopes prices by `credentials.extra.channelSlug`. The token is sent to that
 * host on every request, so the URL must be https and must resolve to a
 * public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const API_URL_LABEL = 'GraphQL API URL'
const TOKEN_LABEL = 'App token'
const EXAMPLE_URL = 'https://your-store.saleor.cloud/graphql/'

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

export const SALEOR_FORM = customForm({
  fields: [
    {
      name: 'apiUrl',
      label: API_URL_LABEL,
      type: 'url',
      required: true,
      placeholder: EXAMPLE_URL,
      helpText:
        'Your Saleor GraphQL endpoint. If you enter only the store address, /graphql/ is added.',
    },
    {
      name: 'accessToken',
      label: TOKEN_LABEL,
      type: 'password',
      required: true,
      helpText:
        'In the Saleor Dashboard open Extensions (Apps in older versions), add a local app with permission to manage products, orders and checkouts, then create and copy its token.',
    },
    {
      name: 'channelSlug',
      label: 'Channel slug',
      type: 'text',
      required: false,
      placeholder: 'default-channel',
      helpText:
        'The channel used for prices and availability (Configuration → Channels). Leave blank to use default-channel.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const rawUrl = (fields['apiUrl'] ?? '').trim()
    const accessToken = (fields['accessToken'] ?? '').trim()
    const channelSlug = (fields['channelSlug'] ?? '').trim()
    if (!rawUrl) throw new Error(`${API_URL_LABEL} is required.`)
    if (!accessToken) throw new Error(`${TOKEN_LABEL} is required.`)

    const url = await parsePublicHttpsUrl(rawUrl, API_URL_LABEL, EXAMPLE_URL)
    const trimmed = url.pathname.replace(/\/+$/, '')
    // Saleor serves the API at a trailing-slash path; a bare store address
    // means the default /graphql/ endpoint.
    const path = trimmed ? `${trimmed}/` : '/graphql/'

    return {
      accessToken,
      extra: {
        apiUrl: `${url.origin}${path}`,
        ...(channelSlug ? { channelSlug } : {}),
      },
    }
  },
})
