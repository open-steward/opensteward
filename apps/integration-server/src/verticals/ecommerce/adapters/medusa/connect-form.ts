/**
 * Medusa Connect Link form.
 *
 * Medusa is self-hosted: the Admin API is served at `{backend}/admin` and
 * authenticates with a secret API key. `MedusaClient` reads `accessToken`
 * (the key) and `extra.host`. The backend URL receives the key on every
 * request, so it is normalised and must be https on a public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'Secret API key',
      type: 'password',
      required: true,
      placeholder: 'sk_…',
      helpText:
        'In Medusa Admin go to Settings → Secret API Keys and create a key. It starts with "sk_" and is shown only once.',
    },
    {
      name: 'host',
      label: 'Medusa backend URL',
      type: 'url',
      required: true,
      placeholder: 'https://api.shop.example.com',
      helpText:
        'The public address of your Medusa server (the one that serves /admin and /store), not your storefront. Must use https.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Secret API key is required.')
    // The admin dashboard lives at `{backend}/app` and the API at
    // `{backend}/admin`; the client appends `/admin` itself.
    const host = await normaliseStoreUrl(fields['host'], 'Medusa backend URL', /\/(app|admin)$/i)
    return {
      accessToken: apiKey,
      extra: { host },
    }
  },
})

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Normalise a customer-typed store URL and refuse anything that must not
 * receive the store's credentials: a non-https scheme, embedded userinfo, or
 * a host that resolves to a private / loopback / link-local address. A bare
 * host is read as https. Query string and fragment are dropped; the path is
 * kept (stores can live in a subfolder) minus trailing slashes and, when
 * given, an API suffix the customer pasted along with it.
 */
export async function normaliseStoreUrl(
  raw: string | undefined,
  label: string,
  stripPathSuffix?: RegExp,
): Promise<string> {
  const input = (raw ?? '').trim()
  if (!input) throw new Error(`${label} is required.`)
  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error(`${label} is not a valid URL — enter it like https://shop.example.com.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `${label} must use https:// — your credentials are sent to it on every request.`,
    )
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain a username or password.`)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  try {
    await assertPublicHost(host)
  } catch (err) {
    const blocked = err instanceof Error && err.name === 'SsrfBlockedError'
    const unresolved = (err as { address?: string }).address === '(no address)'
    if (blocked && !unresolved) {
      throw new Error(
        `${label} must be a public address — ${host} resolves to a private or reserved network address.`, { cause: err },
      )
    }
    throw new Error(`${label} could not be resolved — check that ${host} is spelled correctly.`, { cause: err })
  }
  let path = url.pathname.replace(/\/+$/, '')
  if (stripPathSuffix) path = path.replace(stripPathSuffix, '').replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${path}`
}
