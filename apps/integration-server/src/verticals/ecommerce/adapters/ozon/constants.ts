/**
 * Ozon Seller API constants.
 *
 * The Seller API is RPC over HTTP: every method is a POST with a JSON body to
 * a versioned path on one host. Methods are versioned independently and old
 * versions are switched off — `/v2/product/list`, `/v2/product/info/list`,
 * `/v1/product/import/stocks` and `/v3/product/info/stocks` all answered 404
 * on 2026-09-13 — so every path below was checked live that day (an
 * unauthenticated POST answers 401 "Client-Id and Api-Key headers are
 * required" for a real method, 404 otherwise).
 *
 * Docs: https://docs.ozon.ru/api/seller/
 * Archived official spec (request/response shapes):
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 */

/** The only server in Ozon's spec. */
export const API_BASE_URL = 'https://api-seller.ozon.ru'

/** WarehouseAPI — seller FBS/rFBS warehouses. No request parameters. */
export const WAREHOUSE_LIST = '/v1/warehouse/list'

/** Prices&StocksAPI — SET stock per warehouse (absolute, not a delta). */
export const STOCKS_UPDATE = '/v2/products/stocks'

/** FBS — postings (the unit a seller lists, fetches and cancels). */
export const POSTING_FBS_LIST = '/v3/posting/fbs/list'
export const POSTING_FBS_GET = '/v3/posting/fbs/get'
export const POSTING_FBS_CANCEL = '/v2/posting/fbs/cancel'

/** `/v3/posting/fbs/list` `limit`: "максимум — 1000, минимум — 1". */
export const POSTINGS_MAX_LIMIT = 1000

/** `/v3/posting/fbs/list`: the since/to period "must be no longer than one year". */
export const POSTINGS_MAX_WINDOW_DAYS = 366

/**
 * Cancel reason 402, "другое (вина продавца)" — other, seller's fault. The
 * only documented reason that takes free text, and it requires it
 * (`cancel_reason_message`).
 */
export const CANCEL_REASON_OTHER = 402

/** ReturnsAPI — returns of products sold from the seller's own warehouse. */
export const RETURNS_FBS_LIST = '/v3/returns/company/fbs'

/** `/v3/returns/company/fbs` `limit`: "максимум — 1000, минимум — 1". */
export const RETURNS_MAX_LIMIT = 1000

/** FinanceAPI — accruals and charges. */
export const FINANCE_TRANSACTION_LIST = '/v3/finance/transaction/list'

/**
 * The method states no `page_size` ceiling; the spec's own request example
 * for it sends `page_size: 1000`, the ceiling its sibling list methods
 * document ("от 1 до 1000").
 */
export const FINANCE_MAX_PAGE_SIZE = 1000

/** "Максимальный период … в одном запросе — 1 месяц"; no calendar month exceeds 31 days. */
export const FINANCE_MAX_WINDOW_DAYS = 31

// ── Full-history walks (see ./history.ts) ───────────────────────────────────

/**
 * The oldest instant a full-history walk reaches back to.
 *
 * A BOUND, not a fact about any seller. Ozon "has been operating a
 * marketplace platform for third-party sellers since 2018"
 * (https://en.wikipedia.org/wiki/Ozon.ru, citing The Moscow Times, "Ozon
 * Battling It Out for E-Commerce Supremacy in Russia", 2019-09-10). An FBS
 * posting or a seller finance operation cannot predate the marketplace, so
 * the start of 2018 is at or before the earliest data any connection can
 * hold. If Ozon ever documents an earlier date, lower this; nothing else
 * changes.
 */
export const OZON_HISTORY_FLOOR = '2018-01-01T00:00:00.000Z'

/**
 * Windows one `listOrders` call may visit while it finds nothing new. Posting
 * windows are calendar years, and 2018…2029 is 12 of them, so a postings sync
 * page does not come back empty while older history remains.
 */
export const POSTINGS_WINDOWS_PER_CALL = 12

/**
 * Windows one `listTransactions` call may visit while it finds nothing new.
 * Finance windows are calendar months — about 100 back to the floor — so the
 * cap keeps a single call to at most 24 requests. A seller with a longer
 * empty stretch gets empty sync pages that still report `hasMore: true`;
 * the sync worker steps past those (its identical-page guard only compares
 * non-empty pages).
 */
export const FINANCE_WINDOWS_PER_CALL = 24
