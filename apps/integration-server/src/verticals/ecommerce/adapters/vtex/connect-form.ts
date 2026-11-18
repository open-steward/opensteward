/**
 * VTEX Connect Link form.
 *
 * Every VTEX store is served at `https://{account}.{environment}.com.br`
 * and authenticates with an X-VTEX-API-AppKey + X-VTEX-API-AppToken pair.
 * `VtexClient` reads `accessToken` (the app token), `extra.appKey`,
 * `extra.accountName` and `extra.environment`.
 *
 * The account name becomes part of the hostname that receives the app token,
 * so it is reduced to a bare DNS label: customers may type the account name
 * or paste any VTEX address for it, and anything that is not on a VTEX
 * suffix (including `mystore.vtexcommercestable.com.br.evil.example`) is
 * refused.
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { DEFAULT_ENVIRONMENT } from './constants'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'accountName',
      label: 'VTEX account name',
      type: 'text',
      required: true,
      placeholder: 'mystore',
      helpText:
        'The account name in your VTEX Admin address — "mystore" for https://mystore.myvtex.com. You can paste that address instead.',
    },
    {
      name: 'appKey',
      label: 'App key',
      type: 'text',
      required: true,
      placeholder: 'vtexappkey-mystore-ABCDEF',
      helpText:
        'In VTEX Admin go to Account settings → Account → Security → API keys and generate a key. ' +
        'This is the X-VTEX-API-AppKey value.',
    },
    {
      name: 'appToken',
      label: 'App token',
      type: 'password',
      required: true,
      helpText:
        'Shown once when the key is generated (the X-VTEX-API-AppToken value). ' +
        'Give the key a role with access to Catalog, Orders, Logistics and Master Data.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const rawAccount = (fields['accountName'] ?? '').trim()
    const appKey = (fields['appKey'] ?? '').trim()
    const appToken = (fields['appToken'] ?? '').trim()
    if (!rawAccount) throw new Error('VTEX account name is required.')
    if (!appKey) throw new Error('App key is required.')
    if (!appToken) throw new Error('App token is required.')
    const { accountName, environment } = parseVtexAccount(rawAccount)
    return {
      accessToken: appToken,
      extra: { accountName, appKey, environment },
    }
  },
})

const ACCOUNT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//
/** `{workspace--}{account}.{suffix}` — anchored at both ends. */
const VTEX_HOST =
  /^(?:[a-z0-9-]+--)?([a-z0-9][a-z0-9-]{0,62})\.(vtexcommercestable\.com\.br|vtexcommercebeta\.com\.br|myvtex\.com)$/

/** Reduce an account name or pasted VTEX address to `{ accountName, environment }`. */
export function parseVtexAccount(raw: string): { accountName: string; environment: string } {
  const input = raw.trim().toLowerCase()
  const notVtex = () =>
    new Error(
      `"${raw.trim()}" is not a VTEX store address — enter your account name (e.g. "mystore") ` +
        'or an address ending in .myvtex.com or .vtexcommercestable.com.br.',
    )

  if (ACCOUNT_NAME.test(input)) {
    return { accountName: input, environment: DEFAULT_ENVIRONMENT }
  }

  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(input) ? input : `https://${input}`)
  } catch {
    throw notVtex()
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw notVtex()
  if (url.username || url.password || url.port) throw notVtex()

  const match = VTEX_HOST.exec(url.hostname)
  const accountName = match?.[1]
  if (!match || !accountName) throw notVtex()
  const environment =
    match[2] === 'vtexcommercebeta.com.br' ? 'vtexcommercebeta' : DEFAULT_ENVIRONMENT
  return { accountName, environment }
}
