/**
 * OpenCart Connect Link form.
 *
 * OpenCart core ships no admin REST API; this adapter talks to the
 * "REST Admin API" extension (opencart-api.com), which serves
 * `index.php?route=rest/...` and authenticates with the extension's secret
 * key in the `X-Oc-Restadmin-Id` header. OpenCart is self-hosted, so the
 * connection needs the store URL too. `OpenCartClient` reads `accessToken`
 * and `extra.site`; `OpenCartAdapter.clientFor` prefers `extra.apiKey`.
 * The store URL receives the key on every request, so it is normalised and
 * must be https on a public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'REST Admin API secret key',
      type: 'password',
      required: true,
      helpText:
        'OpenCart has no built-in admin REST API — install the "REST Admin API" extension ' +
        '(opencart-api.com), then copy the secret key from its settings page in OpenCart admin.',
    },
    {
      name: 'site',
      label: 'Store URL',
      type: 'url',
      required: true,
      placeholder: 'https://shop.example.com',
      helpText:
        'The address of your OpenCart store (the folder that contains index.php). Must use https.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('REST Admin API secret key is required.')
    const site = await normaliseStoreUrl(fields['site'], 'Store URL', /\/index\.php$/i)
    return {
      accessToken: apiKey,
      extra: { apiKey, site },
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
