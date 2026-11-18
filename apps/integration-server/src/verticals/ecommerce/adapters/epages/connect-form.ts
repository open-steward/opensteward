/**
 * ePages Beyond Connect Link form — custom (private) app credentials.
 *
 * The merchant creates a "custom app" in their shop's Beyond cockpit (Apps >
 * Custom apps) and gets a client_id/client_secret scoped to that shop
 * (https://github.com/ePages-de/beyond_api-ruby_client#create-a-custom-app).
 * The customer types their shop's address here; it becomes part of the
 * hostname every token request and API call is sent to, so — exactly like
 * `../vtex/connect-form.ts` — it is reduced to a bare DNS label and anything
 * not on the real `*.beyondshop.cloud` suffix (including a look-alike like
 * `myshop.beyondshop.cloud.evil.example`) is refused.
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SHOP_HOST_SUFFIX } from './constants'
import { exchangeClientCredentials } from './auth'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'shop',
      label: 'Shop',
      type: 'text',
      required: true,
      placeholder: 'myshop',
      helpText:
        'The subdomain from your shop’s Beyond address — "myshop" for ' +
        'https://myshop.beyondshop.cloud. You can paste that address instead.',
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText:
        'From Beyond Cockpit → Apps → Custom apps → Add custom app. ' +
        'Grant the app scopes for the resources you want to sync.',
    },
    {
      name: 'clientSecret',
      label: 'Client secret',
      type: 'password',
      required: true,
      helpText: 'Shown once when the custom app is created.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const rawShop = (fields['shop'] ?? '').trim()
    const clientId = (fields['clientId'] ?? '').trim()
    const clientSecret = fields['clientSecret'] ?? ''
    if (!rawShop) throw new Error('Shop is required.')
    if (!clientId) throw new Error('Client ID is required.')
    if (!clientSecret) throw new Error('Client secret is required.')
    const shop = parseEpagesShop(rawShop)
    return exchangeClientCredentials(shop, clientId, clientSecret)
  },
})

const SHOP_LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//
/** `{shop}.beyondshop.cloud` — anchored at both ends, one label before the suffix. */
const BEYOND_HOST = /^([a-z0-9][a-z0-9-]{0,62})\.beyondshop\.cloud$/

/** Reduce a shop label or pasted Beyond address to its bare `{shop}` label. */
export function parseEpagesShop(raw: string): string {
  const input = raw.trim().toLowerCase()
  const notBeyond = () =>
    new Error(
      `"${raw.trim()}" is not an ePages Beyond shop address — enter your shop's name ` +
        `(e.g. "myshop") or an address ending in .${SHOP_HOST_SUFFIX}.`,
    )

  if (SHOP_LABEL.test(input)) return input

  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw notBeyond()
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw notBeyond()
  if (url.username || url.password || url.port) throw notBeyond()

  const match = BEYOND_HOST.exec(url.hostname)
  const shop = match?.[1]
  if (!match || !shop) throw notBeyond()
  return shop
}
