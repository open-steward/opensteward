/**
 * GOFRUGAL Connect Link form.
 *
 * GOFRUGAL's eCommerce Integration API is served by the merchant's own
 * on-premises RetailEasy "WebReporter" service (documented default
 * `http://localhost:8482/WebReporter/api/v1/`) — there is no GOFRUGAL-hosted
 * host, so a connection needs the merchant's own WebReporter URL as well as
 * the `X-Auth-Token` API key configured inside RetailEasy. The URL receives
 * that key on every request, so — same as the WooCommerce connect form — it
 * is normalised and must be https on a resolvable, non-private address by
 * default. Deployments that only reach WebReporter over a LAN can opt out
 * with `OST_ALLOW_PRIVATE_HOSTS=1` (see `assertPublicHost` in
 * `@opensteward/shared`).
 *
 * GOFRUGAL's API never reports a currency (RetailEasy is used well outside
 * India too, so one can't be assumed) — the merchant picks the ISO 4217
 * code their deployment prices in here, once, at connect time.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 */
import { assertPublicHost, customForm, Iso4217Currency } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { WEB_REPORTER_API_PATH } from './constants'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'baseUrl',
      label: 'WebReporter base URL',
      type: 'url',
      required: true,
      placeholder: 'https://retaileasy.example.com',
      helpText:
        "The HTTPS address of your RetailEasy installation's WebReporter service, reachable from " +
        'this server (the on-device default is http://localhost:8482/WebReporter/api/v1 — expose it ' +
        'over HTTPS with your own certificate for this integration). Deployments that only reach a ' +
        'LAN/private host can set OST_ALLOW_PRIVATE_HOSTS=1 to allow it.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText: 'The X-Auth-Token value configured for this integration inside RetailEasy.',
    },
    {
      name: 'currency',
      label: 'Currency',
      type: 'text',
      required: true,
      placeholder: 'INR',
      helpText:
        'The 3-letter ISO 4217 code this RetailEasy deployment prices in (e.g. INR, AED, USD). ' +
        'GOFRUGAL never reports a currency on any record, so every amount from this connection is ' +
        'labelled with whatever is entered here — get it right for this specific deployment.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!(fields['baseUrl'] ?? '').trim()) throw new Error('WebReporter base URL is required.')
    const currency = (fields['currency'] ?? '').trim().toUpperCase()
    if (!currency) throw new Error('Currency is required.')
    const currencyCheck = Iso4217Currency.safeParse(currency)
    if (!currencyCheck.success) {
      throw new Error('Currency must be a 3-letter ISO 4217 code (e.g. INR, AED, USD).')
    }
    const baseUrl = await normaliseWebReporterUrl(fields['baseUrl'], 'WebReporter base URL')
    return {
      accessToken: apiKey,
      extra: { apiKey, baseUrl, currency },
    }
  },
})

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const API_PATH_SUFFIX = /\/WebReporter\/api\/v1\/?$/i

/**
 * Normalise a customer-typed WebReporter URL: https-only, no embedded
 * userinfo, host must resolve to a public address (unless
 * `OST_ALLOW_PRIVATE_HOSTS=1`), and the result always ends in the canonical
 * `/WebReporter/api/v1` base regardless of whether the customer pasted that
 * suffix themselves.
 */
export async function normaliseWebReporterUrl(raw: string | undefined, label: string): Promise<string> {
  const input = (raw ?? '').trim()
  if (!input) throw new Error(`${label} is required.`)
  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error(`${label} is not a valid URL — enter it like https://retaileasy.example.com.`)
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
        `${label} must be a public address — ${host} resolves to a private or reserved network ` +
          'address. Set OST_ALLOW_PRIVATE_HOSTS=1 if this deployment intentionally connects to a ' +
          'LAN-hosted RetailEasy instance.',
        { cause: err },
      )
    }
    throw new Error(`${label} could not be resolved — check that ${host} is spelled correctly.`, {
      cause: err,
    })
  }
  const path = url.pathname.replace(/\/+$/, '').replace(API_PATH_SUFFIX, '')
  return `${url.protocol}//${url.host}${path}${WEB_REPORTER_API_PATH}`
}
