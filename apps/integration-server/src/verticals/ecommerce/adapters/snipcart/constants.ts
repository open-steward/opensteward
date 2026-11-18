/**
 * Snipcart REST API constants.
 *
 * Snipcart exposes a single unified endpoint for both test and live traffic.
 * The mode (Test vs Live) is determined by which secret API key is used — the
 * live secret key produces live data; the public/test key produces test data.
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/introduction
 */
export const BASE_URL = 'https://app.snipcart.com/api'

/**
 * Snipcart's documented default `limit` on products, customers and orders.
 * No maximum is documented, so none is declared or enforced.
 */
export const DEFAULT_PAGE_SIZE = 20
