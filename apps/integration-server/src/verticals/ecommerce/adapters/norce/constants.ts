/**
 * Norce Commerce constants.
 *
 * Docs: https://docs.norce.io/api-reference (overview),
 *       https://docs.norce.io/api-reference/accessing-apis-with-oauth2-accounts (auth),
 *       https://docs.norce.io/api-reference/query/queryproducts/openapi (Commerce Query — Products group),
 *       https://docs.norce.io/api-reference/query/querycustomers/openapi (Commerce Query — Customers group),
 *       https://docs.norce.io/api-reference/query/queryorders/openapi (Commerce Query — Orders group)
 */

/** Commerce Query API version segment, e.g. `/commerce/query/2.0/`. */
export const QUERY_API_VERSION = '2.0'

/**
 * Environments confirmed by the OAuth2 docs. `prod` is the only one whose
 * hostname segment is omitted (see `buildHost` in `./auth`).
 */
export const ENVIRONMENTS = ['prod', 'stage', 'playground'] as const
export type NorceEnvironment = (typeof ENVIRONMENTS)[number]

/**
 * OData `$top` defaults. Norce's public reference does not publish a page-size
 * ceiling for Commerce Query, so this is a conservative, unverified-but-safe
 * choice rather than a documented limit — tighten or loosen once confirmed
 * against a live tenant.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Token lifetime per docs is 3600s, but the same page explicitly warns
 * against hardcoding it: "cache tokens during this period and read the
 * `expires_in` response field rather than hardcoding values." `auth.ts`
 * always uses the response's own `expires_in`; this constant is only a
 * fallback for the (undocumented, defensive) case a token response omits it.
 */
export const FALLBACK_TOKEN_LIFETIME_SECONDS = 3600

/** Refresh this many seconds before the token's reported expiry. */
export const TOKEN_REFRESH_SKEW_SECONDS = 60

/** Token endpoint is rate-limited: 3 req/min, burst 20 — mint once, cache, reuse. */
export const TOKEN_ENDPOINT_PATH = '/identity/1.0/connect/token'
