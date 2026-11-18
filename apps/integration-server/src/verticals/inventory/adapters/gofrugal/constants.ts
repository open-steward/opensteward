/**
 * GoFrugal RetailEasy API constants.
 *
 * GoFrugal's WebReporter API is an on-premises service. The base URL is
 * configurable per installation — the default port is 8482. Customers expose
 * it as http://<host>:8482/WebReporter.
 *
 * Auth: X-Auth-Token header (API key generated inside RetailEasy admin).
 */

/** Default path prefix appended to the customer-supplied base URL. */
export const API_PATH_PREFIX = '/api/v1'

/** Fallback base URL used when none is supplied via credentials. */
export const DEFAULT_BASE_URL = 'http://localhost:8482/WebReporter'

export const DEFAULT_PAGE_SIZE = 100

/**
 * Page size for walking the item master (listLocations, and the get* lookups,
 * which have no documented filter). GoFrugal documents no maximum for /items;
 * the only one on the WebReporter API is "A maximum of 250 sales orders alone
 * can be retrieved at one time." The walk ends on the envelope's total_pages
 * or an empty page, never on a page shorter than this size.
 */
export const ITEMS_WALK_PAGE_SIZE = 250

/** Upper bound on /items pages in one walk: a server that never ends fails loudly. */
export const MAX_ITEMS_WALK_PAGES = 10_000
