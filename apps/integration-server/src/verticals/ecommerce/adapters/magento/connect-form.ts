/**
 * Magento / Adobe Commerce Connect Link form.
 *
 * Magento is self-hosted: the REST API is served at `{store}/rest/V1` and
 * `MagentoClient` reads `accessToken` (sent as `Authorization: Bearer`) and
 * `extra.baseUrl`.
 *
 * The form collects an integration access token, not an admin
 * username/password. Magento 2.4+ enforces two-factor auth on
 * `POST /V1/integration/admin/token`, so a password alone cannot mint a
 * token on a stock install; integration tokens are the documented
 * server-to-server credential and do not expire, so no `expiresAt` is set
 * and `refreshCredentials` is never triggered for these connections.
 *
 * The store URL receives the token on every request, so it is normalised and
 * must be https on a public address.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'accessToken',
      label: 'Integration access token',
      type: 'password',
      required: true,
      helpText:
        'In Magento admin go to System → Extensions → Integrations → Add New Integration, grant it access to ' +
        'the resources you need, then Activate it and copy the Access Token. On Magento 2.4.4+ also set ' +
        'Stores → Configuration → Services → OAuth → Consumer Settings → "Allow OAuth Access Tokens to be ' +
        'used as standalone Bearer tokens" to Yes.',
    },
    {
      name: 'baseUrl',
      label: 'Store URL',
      type: 'url',
      required: true,
      placeholder: 'https://store.example.com',
      helpText: 'The base address of your store — the part in front of /rest/V1. Must use https.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const accessToken = (fields['accessToken'] ?? '').trim()
    if (!accessToken) throw new Error('Integration access token is required.')
    const baseUrl = await normaliseStoreUrl(fields['baseUrl'], 'Store URL', /\/rest(\/v1)?$/i)
    return {
      accessToken,
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
