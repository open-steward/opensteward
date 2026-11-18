/**
 * Marketplacer Connect Link form.
 *
 * A Marketplacer connection is a seller on one specific operator's
 * marketplace instance. The seller generates a static API key from their
 * Seller Portal (Extensions → API Access) and pastes it here along with
 * that operator's instance domain — there is no OAuth authorization-code
 * flow for the Seller API.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/getting_started/
 *   "Enter 'marketplacer-api-key' for the header Key" — auth header name.
 *   "there is only 1 GraphQL endpoint ... https://YOURINSTANCENAME.COM/graphql"
 *   "If you are working with a non production environment, in addition to
 *    an API key, you may also need to supply Basic Authentication
 *    credentials. These can be supplied to you by your Seller Onboarding
 *    team." — optional HTTP Basic, non-production instances only.
 */
import { assertPublicHost, customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const CURRENCY_RE = /^[A-Z]{3}$/

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'instanceUrl',
      label: 'Marketplace instance URL',
      type: 'url',
      required: true,
      placeholder: 'https://bestfriendbazaar.com',
      helpText:
        "Your operator's Marketplacer instance domain — the same host their GraphQL " +
        'endpoint lives on (https://{instance}/graphql).',
    },
    {
      name: 'apiKey',
      label: 'Seller API key',
      type: 'password',
      required: true,
      helpText:
        'Seller Portal → Extensions → API Access → Create API Key. Copy it now — ' +
        'Marketplacer will not show it again once you navigate away.',
    },
    {
      name: 'currency',
      label: 'Marketplace currency',
      type: 'text',
      required: true,
      placeholder: 'AUD',
      helpText:
        '3-letter ISO 4217 code your operator’s marketplace prices in (e.g. AUD, USD, NZD). ' +
        'Marketplacer’s GraphQL API reports money as a plain number with no currency field of ' +
        'its own, so this adapter cannot infer it — it must come from you.',
    },
    {
      name: 'basicAuthUsername',
      label: 'Basic auth username (non-production only)',
      type: 'text',
      required: false,
      helpText:
        'Only required on some non-production Marketplacer instances, supplied by your ' +
        'Seller Onboarding team. Leave blank on production.',
    },
    {
      name: 'basicAuthPassword',
      label: 'Basic auth password (non-production only)',
      type: 'password',
      required: false,
      helpText: 'Paired with the Basic auth username above.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!apiKey) throw new Error('Seller API key is required.')
    const currency = (fields['currency'] ?? '').trim().toUpperCase()
    if (!currency) throw new Error('Marketplace currency is required.')
    if (!CURRENCY_RE.test(currency)) {
      throw new Error('Marketplace currency must be a 3-letter ISO 4217 code, e.g. AUD.')
    }
    const basicAuthUsername = (fields['basicAuthUsername'] ?? '').trim()
    const basicAuthPassword = (fields['basicAuthPassword'] ?? '').trim()
    if (Boolean(basicAuthUsername) !== Boolean(basicAuthPassword)) {
      throw new Error('Basic auth username and password must be supplied together, or not at all.')
    }
    const instanceHost = await normaliseInstanceUrl(fields['instanceUrl'], 'Marketplace instance URL')
    return {
      accessToken: apiKey,
      extra: {
        apiKey,
        instanceHost,
        currency,
        ...(basicAuthUsername ? { basicAuthUsername, basicAuthPassword } : {}),
      },
    }
  },
})

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Normalise a customer-typed operator instance URL to `https://host` (no
 * path — the GraphQL endpoint is always exactly `{host}/graphql`), refusing
 * a non-https scheme, embedded userinfo, or a host that resolves to a
 * private / loopback / link-local address. A bare host is read as https.
 */
export async function normaliseInstanceUrl(raw: string | undefined, label: string): Promise<string> {
  const input = (raw ?? '').trim()
  if (!input) throw new Error(`${label} is required.`)
  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw new Error(`${label} is not a valid URL — enter it like https://your-instance.com.`)
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
  return `${url.protocol}//${url.host}`
}
