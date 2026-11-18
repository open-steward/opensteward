/**
 * JTL-Shop Connect Link form.
 *
 * JTL-Shop is self-hosted: the REST API is served at `{shop}/api/v1` and
 * authenticates with a static key in the `x-api-key` header. `JtlShopClient`
 * reads `accessToken` (the key) and `extra.baseUrl`. The shop URL receives
 * the key on every request, so it is normalised and must be https on a
 * public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Generate an API key in the JTL-Shop admin panel: Backend → REST API → API-Keys. ' +
        'The REST API must be enabled for your shop.',
    },
    {
      name: 'baseUrl',
      label: 'Shop URL',
      type: 'url',
      required: true,
      placeholder: 'https://shop.example.com',
      helpText: 'The address of your JTL-Shop storefront. Must use https.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const baseUrl = await normaliseStoreUrl(fields['baseUrl'], 'Shop URL', /\/api\/v1$/i)
    return {
      accessToken: apiKey,
      extra: { baseUrl },
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
