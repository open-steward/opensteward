/**
 * Cielo eCommerce API 3.0 — base URLs.
 *
 * Cielo splits its REST surface across two hosts: a *transactional* host for
 * writes (create sale, capture, void) and a separate *query* host for reads
 * (query sale, query BIN). Each has a distinct sandbox and production
 * endpoint. The client picks the host per-operation; the environment is
 * selected from `Credentials.extra.environment`.
 *
 * Docs: https://developercielo.github.io/manual/cielo-ecommerce
 */

export const SANDBOX_TRANSACTION_BASE_URL = 'https://apisandbox.cieloecommerce.cielo.com.br'
export const SANDBOX_QUERY_BASE_URL = 'https://apiquerysandbox.cieloecommerce.cielo.com.br'

export const PRODUCTION_TRANSACTION_BASE_URL = 'https://api.cieloecommerce.cielo.com.br'
export const PRODUCTION_QUERY_BASE_URL = 'https://apiquery.cieloecommerce.cielo.com.br'

/** Sales (create / query / capture / void). */
export const SALES_PATH = '/1/sales'
/** Card BIN lookup (issuer + brand metadata). */
export const CARD_BIN_PATH = '/1/cardBin'

/**
 * Cielo has no list/pagination surface — every read is a point lookup by
 * PaymentId — so there is no page-size knob. Kept only for parity with the
 * adapter interface's `QueryParams.limit`, which Cielo ignores.
 */
export const DEFAULT_PAGE_SIZE = 50
