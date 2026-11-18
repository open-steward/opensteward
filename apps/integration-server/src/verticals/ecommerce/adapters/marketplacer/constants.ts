/**
 * Marketplacer Seller API constants.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/
 */

/** Conservative default; well under every documented ceiling below. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Marketplacer's page-size ceiling is NOT one number for the whole API:
 *
 *  - `advertsWhere` / `taxons` / `brands` — "Default Page Size (if none
 *    specified): 20,000. Maximum Page Size: 20,000 unless otherwise specified"
 *    (docs/seller-api/examples/utility/howto_paginate).
 *  - `invoices` — "This will return a JSON payload with the first 100
 *    invoices for the Seller. The maximum page size for the invoices
 *    collection is 100." (docs/seller-api/examples/orders/invoices).
 *
 * `capabilities.maxPageSize` is one adapter-wide number, so this uses the
 * tightest documented ceiling (invoices, our primary sync resource) rather
 * than the much larger 20,000 default that would silently 400 on invoices.
 */
export const MAX_PAGE_SIZE = 100

/**
 * Header name this adapter's webhook setup instructions ask the seller to
 * configure in the Marketplacer Webhooks Admin page, under "Option 1: Add a
 * Key or Token Directly to the Header" — documented as available to both
 * Operators and Sellers (unlike the HMAC option, which the same page notes
 * is "only available for Operator-based webhooks"; see ./webhook.ts).
 * Marketplacer lets the seller pick any header name; this is OUR half of
 * that convention, not a Marketplacer-fixed constant.
 */
export const WEBHOOK_TOKEN_HEADER = 'x-opensteward-webhook-token'

/** GraphQL API version path suffix — Marketplacer has exactly one endpoint. */
export const GRAPHQL_PATH = '/graphql'
