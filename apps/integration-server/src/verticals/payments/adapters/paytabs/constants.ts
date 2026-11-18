/**
 * PayTabs PT2 REST API constants.
 *
 * PayTabs runs region-specific hosts that share an identical endpoint surface;
 * a connection must talk to the host that issued its merchant profile, or the
 * request fails authentication. The default below is the UAE / global host
 * (`secure.paytabs.com`); operators point a connection at another region via a
 * base-URL override (see {@link REGION_BASE_URLS} and the `region` Connect-form
 * field).
 *
 * Auth: the merchant Server Key is sent verbatim as the `authorization` header
 * value (no `Bearer` prefix); the (non-secret) Profile ID rides in the JSON
 * body. Amounts are decimal major-unit strings (e.g. `"500.00"`); datetimes
 * are ISO-ish strings normalised through `toIsoDatetime`.
 *
 * Docs: https://docs.paytabs.com/ (PT2 API Endpoints)
 */

/** Default API host — UAE / global. Overridable per connection by region. */
export const API_BASE_URL = 'https://secure.paytabs.com'

/** Region → API host. Each PayTabs region issues its own merchant profiles. */
export const REGION_BASE_URLS: Record<string, string> = {
  ARE: 'https://secure.paytabs.com',
  SAU: 'https://secure.paytabs.sa',
  EGY: 'https://secure-egypt.paytabs.com',
  OMN: 'https://secure-oman.paytabs.com',
  JOR: 'https://secure-jordan.paytabs.com',
  KWT: 'https://secure-kuwait.paytabs.com',
  IRQ: 'https://secure-iraq.paytabs.com',
  QAT: 'https://secure-doha.paytabs.com',
  MAR: 'https://secure-morocco.paytabs.com',
  GLOBAL: 'https://secure-global.paytabs.com',
}

/** Resolve a region code to its API host, falling back to the UAE / global host. */
export function baseUrlForRegion(region: string | undefined): string {
  if (!region) return API_BASE_URL
  return REGION_BASE_URLS[region.trim().toUpperCase()] ?? API_BASE_URL
}

/** Create / mutate a transaction (sale, auth, capture, void, refund). */
export const REQUEST_PATH = '/payment/request'
/** Query an existing transaction by `tran_ref` or `cart_id`. */
export const QUERY_PATH = '/payment/query'
