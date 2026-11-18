/**
 * IdoSell Connect Link form.
 *
 * Every IdoSell shop's Admin API lives on the shop's own panel domain
 * (`https://{domain}/api/admin/v8/...` — see `./constants.ts`), so a
 * connection needs both the API key and that domain. The domain receives the
 * `X-API-KEY` header on every request, so — same reasoning as WooCommerce's
 * `site` field — it is normalised and confined to a public https host.
 *
 * IdoSell's docs describe the domain only as "the panel address, consisting
 * of the panel number and the repetitive part of the address" (variable
 * example `clientXXX.idosell.com`) without documenting a closed set of
 * suffixes a custom panel domain must end in, so unlike VTEX's
 * `parseVtexAccount` there is no fixed-suffix allowlist to check against —
 * we fall back to the general rule: require `https:`, reject embedded
 * credentials, and require `assertPublicHost`.
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
        'Generate an Admin API key in your IdoSell panel (Administration → API keys / Apps). ' +
        'Sent as the X-API-KEY header on every request.',
    },
    {
      name: 'shopDomain',
      label: 'Shop domain',
      type: 'url',
      required: true,
      placeholder: 'https://clientXXX.idosell.com',
      helpText:
        'Your panel address, e.g. "clientXXX.idosell.com" or a custom panel domain. Must use https.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    const shopDomain = await normaliseShopDomain(fields['shopDomain'], 'Shop domain')
    return {
      accessToken: apiKey,
      extra: { apiKey, shopDomain },
    }
  },
})

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Normalise a customer-typed panel domain: require https, reject embedded
 * userinfo, and require a resolvable public host — the API key transits to
 * this host on every request. A bare host (no scheme) is read as https.
 * Mirrors `woocommerce/connect-form.ts#normaliseStoreUrl`.
 */
export async function normaliseShopDomain(raw: string | undefined, label: string): Promise<string> {
  const input = (raw ?? '').trim()
  if (!input) throw new Error(`${label} is required.`)
  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error(`${label} is not a valid URL — enter it like clientXXX.idosell.com.`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must use https:// — your API key is sent to it on every request.`)
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
        `${label} must be a public address — ${host} resolves to a private or reserved network address.`,
        { cause: err },
      )
    }
    throw new Error(`${label} could not be resolved — check that ${host} is spelled correctly.`, {
      cause: err,
    })
  }
  return url.host
}
