/**
 * Ordergroove REST API constants.
 *
 * Ordergroove is a subscription / relationship-commerce layer bolted onto an
 * existing storefront — not a store in its own right. It exposes a
 * resource-oriented REST API for the objects it owns: customers
 * (subscribers), subscriptions, order events, and the merchant's product
 * catalog as Ordergroove knows it.
 *
 * Base URL — confirmed 2026-09-13 against
 * https://developer.ordergroove.com/reference/start (and cross-referenced at
 * .../docs/developer-fundamentals): production `https://restapi.ordergroove.com`,
 * staging `https://staging.restapi.ordergroove.com`. The same page notes the
 * *legacy* API lived at `https://api.ordergroove.com` and is deprecated — that
 * is the host a prior researcher guessed for this adapter; it is real, but it
 * is the OLD host, not the current one.
 *
 * Pagination — https://developer.ordergroove.com/reference/pagination:
 * cursor-based via `cursor` + `page_size` query params (max 100), response
 * envelope `{ count, next, previous, results }`.
 *
 * Rate limit — https://developer.ordergroove.com/reference/ordergroove-api-rate-limits:
 * 6,000 requests per IP per minute across restapi.ordergroove.com and its
 * staging counterpart; 429 on breach, safe to retry.
 */
export const PRODUCTION_BASE_URL = 'https://restapi.ordergroove.com'
export const STAGING_BASE_URL = 'https://staging.restapi.ordergroove.com'

/** `page_size` default for list requests (Ordergroove's own docs don't state
 *  a default distinct from the max — we pick a conservative one). */
export const DEFAULT_PAGE_SIZE = 50

/** `page_size` max per https://developer.ordergroove.com/reference/pagination. */
export const MAX_PAGE_SIZE = 100
