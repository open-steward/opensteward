/**
 * WooCommerce Connect Link form.
 *
 * WooCommerce is self-hosted, so a connection needs the store's own URL as
 * well as the consumer key + secret pair. `WooCommerceClient` reads
 * `accessToken` (consumer key), `extra.consumerSecret` and `extra.site`;
 * `WooCommerceAdapter.clientFor` prefers `extra.consumerKey`. The store URL
 * receives the secret on every request, so it is normalised and must be
 * https on a public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'consumerKey',
      label: 'Consumer key',
      type: 'password',
      required: true,
      placeholder: 'ck_…',
      helpText:
        'In WordPress admin go to WooCommerce → Settings → Advanced → REST API → Add key, ' +
        'choose Read (or Read/Write) permissions and generate. The consumer key starts with "ck_".',
    },
    {
      name: 'consumerSecret',
      label: 'Consumer secret',
      type: 'password',
      required: true,
      placeholder: 'cs_…',
      helpText:
        'Shown once, next to the consumer key, when you generate it. Starts with "cs_".',
    },
    {
      name: 'site',
      label: 'Store URL',
      type: 'url',
      required: true,
      placeholder: 'https://shop.example.com',
      helpText:
        'The address of your WordPress site, including any subfolder WordPress is installed in. Must use https.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const consumerKey = (fields['consumerKey'] ?? '').trim()
    const consumerSecret = (fields['consumerSecret'] ?? '').trim()
    if (!consumerKey) throw new Error('Consumer key is required.')
    if (!consumerSecret) throw new Error('Consumer secret is required.')
    if (!(fields['site'] ?? '').trim()) throw new Error('Store URL is required.')
    if (!consumerKey.startsWith('ck_')) {
      throw new Error(
        'Consumer key should start with "ck_" — check it was not swapped with the consumer secret.',
      )
    }
    if (!consumerSecret.startsWith('cs_')) {
      throw new Error(
        'Consumer secret should start with "cs_" — check it was not swapped with the consumer key.',
      )
    }
    const site = await normaliseStoreUrl(fields['site'], 'Store URL')
    return {
      accessToken: consumerKey,
      extra: { consumerKey, consumerSecret, site },
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
