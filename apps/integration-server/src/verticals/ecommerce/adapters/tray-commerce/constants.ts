/**
 * Tray Commerce (Tray Corp / Locaweb, Brazil) API constants.
 *
 * Docs: https://developers.tray.com.br/ (single-page reference, Portuguese).
 * Verified sections: `#autorizacao` (OAuth2 authorization-code flow) and
 * `#api-de-produtos` (Products) — both returned literal endpoint paths,
 * request/response fields and a curl example. Everything else on the page
 * (variations, categories, customers, orders, Multi-CD, payments, coupons)
 * was confirmed to EXIST via the page's own table of contents, but the
 * fetched content truncates before their field-level tables — see the
 * per-file header comments for what is convention-inferred vs. verified.
 */

/**
 * Tray (Locaweb) serves only Brazilian stores and its API carries no currency
 * field, so amounts are reported in BRL. Live verification should confirm this
 * for every connected store.
 */
export const DEFAULT_CURRENCY = 'BRL'

/**
 * Verified: every documented list response's `paging` example shows
 * `"maxLimit": 50` (products, variants and customers examples all agree).
 * `capabilities.maxPageSize` is read once by the sync worker to decide
 * whether a short page means "end of collection" — see
 * `EcommerceAdapter`/`AdapterCapabilities.maxPageSize` doc comment — so the
 * declared value must match what the client actually clamps to, which it does.
 */
export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 50

/**
 * Rate limits, quoted verbatim from developers.tray.com.br:
 * "1 - Quantidade de requisições de curto espaço de tempo, limitado em 180
 * requisições por minuto. 2 - Quantidade de requisições diárias, limitado em
 * 10 mil requisições diárias por loja." `withRetry` (429 + exponential
 * backoff) is what actually protects call sites; these are documentation only.
 */
export const RATE_LIMIT_PER_MINUTE = 180
export const RATE_LIMIT_PER_DAY = 10_000
