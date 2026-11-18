/**
 * Tray Commerce OAuth2 helpers.
 *
 * Verified against https://developers.tray.com.br/ `#autorizacao`,
 * `#gerar-chaves-de-acesso-post` and `#atualizar-chave-de-acesso-get` (the
 * page returned literal endpoint paths, curl examples and response field
 * names for these three sections):
 *
 *   1. Redirect the merchant to `https://{store_domain}/auth.php` with
 *      `response_type=code`, `consumer_key` (one app, reused across every
 *      store that installs it) and `callback` (our redirect URL).
 *   2. Tray redirects back to `callback` with FIVE query params — quoted
 *      verbatim from the docs' own example dump:
 *      `array(5) { ["adm_user"]=> ... ["code"]=> ... ["api_address"]=>
 *      "https://trayparceiros.commercesuite.com.br/web_api" ["store"]=> ...
 *      ["store_host"]=> ... }`. This adapter does NOT depend on the shared
 *      OAuth callback route forwarding `api_address`/`store`/`adm_user`/
 *      `store_host` to `exchangeCodeWithInputs` — it doesn't, and only ever
 *      passes `code` plus the `oauthFields` collected before the redirect
 *      (see `packages/shared/src/control-plane/auth-router.ts`). Instead
 *      the store's api root is DERIVED from the same `storeDomain` input
 *      used to build the authorize URL, per the docs' own description of
 *      `api_address` as "o endereço da loja + web_api" (example:
 *      `www.urldaloja.com.br/web_api`) — `https://{storeDomain}/web_api`.
 *   3. `POST {api_address}/auth` with `consumer_key` + `consumer_secret` +
 *      `code` (body fields, per the docs' curl example) returns
 *      `access_token`, `refresh_token`, `date_expiration_access_token`,
 *      `date_expiration_refresh_token`, `date_activated`, `api_host` (the
 *      host used for every subsequent call — can differ from `api_address`,
 *      so it — not the derived address — is what gets stored) and
 *      `store_id`.
 *   4. `GET {api_host}/auth?refresh_token={refresh_token}` re-mints the
 *      pair, same response shape.
 *
 * KNOWN GAP (flagged, not silently assumed): the docs' own callback-params
 * dump lists exactly `adm_user`, `code`, `api_address`, `store`,
 * `store_host` — no `state`, and nothing on the page says whether a query
 * string already present on the registered `callback` URL survives Tray's
 * redirect (appended with `&`) or is clobbered (appended with a second `?`,
 * which would corrupt parsing — `code` would stop parsing as its own field).
 * This adapter embeds `state` in the `callback` query string because the
 * shared OAuth callback route hard-requires `state` and this adapter cannot
 * change that route. If Tray clobbers it, the callback's `store` id is the
 * only other correlation key it sends, and the shared route would need a
 * fallback path keyed on it — verify the real behaviour against a live
 * sandbox during Tray's homologação certification before relying on this
 * in production.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { assertPublicHost } from '@opensteward/shared'

export function oauthFields(): CredentialField[] {
  return [
    {
      name: 'storeDomain',
      label: 'Tray store domain',
      type: 'text',
      required: true,
      placeholder: 'minhaloja.commercesuite.com.br',
      helpText:
        'The domain you use to reach your Tray admin panel. This can be a custom domain — ' +
        'Tray does not require the commercesuite.com.br suffix.',
    },
  ]
}

/**
 * Reduce whatever the customer typed to a bare hostname: `minhaloja.com.br`,
 * `https://minhaloja.com.br/`, and a pasted admin URL all become
 * `minhaloja.com.br`. No fixed-suffix check (unlike Shopify/Zendesk) —
 * Tray stores legitimately sit on arbitrary custom domains.
 */
export function normaliseStoreDomain(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    throw new Error('Tray store domain is required (e.g. minhaloja.commercesuite.com.br).')
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`Tray store domain is not a valid URL: ${trimmed}`)
  }
  if (!url.hostname) throw new Error(`Tray store domain is not a valid URL: ${trimmed}`)
  return url.hostname
}

/**
 * Validate + normalise a host Tray hands us mid-flow (`api_address` on the
 * callback, `api_host` in the token response) BEFORE it receives the
 * consumer secret or a live access token. Requires `https:` and rejects
 * private/loopback/link-local resolution — the store domain is
 * customer-controlled and can be a custom domain, so this cannot be skipped
 * the way a fixed-host platform's client can.
 *
 * Returns the origin + path with any trailing slash stripped, so callers can
 * safely do `` `${apiHost}/products` ``.
 */
export async function assertSafeApiHost(raw: string | undefined | null, label: string): Promise<string> {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new Error(`Tray ${label} is missing from the response.`)
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`Tray ${label} is not a valid URL: ${trimmed}`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Tray ${label} must use https:// (got ${trimmed}).`)
  }
  await assertPublicHost(url.hostname)
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Embed `state` into the callback URL's own query string — see the file header's KNOWN GAP note. */
function withState(redirectUri: string, state: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set('state', state)
  return url.toString()
}

export function buildAuthUrl(
  storeDomain: string,
  consumerKey: string,
  redirectUri: string,
  state: string,
): string {
  const host = normaliseStoreDomain(storeDomain)
  const params = new URLSearchParams({
    response_type: 'code',
    consumer_key: consumerKey,
    callback: withState(redirectUri, state),
  })
  return `https://${host}/auth.php?${params.toString()}`
}

interface TrayTokenResponse {
  message?: string
  code?: number
  access_token: string
  refresh_token?: string
  date_expiration_access_token?: string
  date_expiration_refresh_token?: string
  date_activated?: string
  api_host: string
  store_id?: string | number
}

function parseExpiry(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * Exchange the authorization code on the STORE's own api address — never a
 * fixed Tray host. `storeDomain` is the same customer-supplied `oauthFields`
 * value used to build the authorize URL; the api address is derived from it
 * (`https://{storeDomain}/web_api`, per the docs' own description) and
 * validated (https, public) before it ever sees the consumer secret.
 */
export async function exchangeCode(
  storeDomain: string,
  code: string,
  consumerKey: string,
  consumerSecret: string,
): Promise<Credentials> {
  const host = normaliseStoreDomain(storeDomain)
  const requestHost = await assertSafeApiHost(`https://${host}/web_api`, 'derived api address')
  const { data } = await axios.post<TrayTokenResponse>(
    `${requestHost}/auth`,
    new URLSearchParams({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      code,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  // Tray's response carries its own `api_host` for subsequent calls — validate
  // it too rather than trusting the derived address was the same host forever.
  const apiHost = await assertSafeApiHost(data.api_host ?? requestHost, 'api_host')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: parseExpiry(data.date_expiration_access_token),
    extra: {
      apiHost,
      storeDomain: host,
      ...(data.store_id != null ? { storeId: String(data.store_id) } : {}),
    },
  }
}

/**
 * `GET {api_host}/auth?refresh_token={refresh_token}` — same response shape
 * as the code exchange. Re-validates the stored `api_host` before every
 * refresh: it carries the refresh token, and a connection can sit unrefreshed
 * for a long time between calls.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const storedHost = typeof extra['apiHost'] === 'string' ? extra['apiHost'] : ''
  if (!storedHost || !credentials.refreshToken) {
    // Nothing to refresh with — return unchanged and let the next call 401.
    return credentials
  }
  const apiHost = await assertSafeApiHost(storedHost, 'api_host')
  const { data } = await axios.get<TrayTokenResponse>(`${apiHost}/auth`, {
    params: { refresh_token: credentials.refreshToken },
  })
  const nextApiHost = await assertSafeApiHost(data.api_host ?? apiHost, 'api_host')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: parseExpiry(data.date_expiration_access_token),
    extra: {
      ...extra,
      apiHost: nextApiHost,
      ...(data.store_id != null ? { storeId: String(data.store_id) } : {}),
    },
  }
}
