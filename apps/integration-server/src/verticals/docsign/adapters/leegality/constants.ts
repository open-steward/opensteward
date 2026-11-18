/**
 * Leegality REST API constants.
 *
 * Leegality is an Indian eSign + eStamp document-execution gateway. The
 * REST API is versioned under `/api/v3.0`. Authentication is a static
 * per-environment Auth Token sent in the `X-Auth-Token` header — there is
 * no OAuth flow. Sandbox and production are different hosts, each issuing
 * its own Auth Token + Private Salt from the dashboard's API Settings tab.
 *
 * Webhooks: Leegality POSTs the document payload (mirroring the Details
 * API response) with a `mac` field — HMAC-SHA1 of `documentId` keyed by
 * the Private Salt.
 *
 * Docs: https://knowledge.leegality.com/document-execution/api/authentication
 */

/** Production host (root; resource paths nest under `/api/v3.0`). */
export const PRODUCTION_BASE_URL = 'https://app1.leegality.com/api'

/** Sandbox host. */
export const SANDBOX_BASE_URL = 'https://sandbox.leegality.com/api'

/** Default host when the customer does not pin an environment. */
export const DEFAULT_BASE_URL = PRODUCTION_BASE_URL

/** API version segment prefixed to every resource path. */
export const API_VERSION = 'v3.0'

/** Auth header name. Leegality does NOT use `Authorization: Bearer`. */
export const AUTH_HEADER = 'X-Auth-Token'

export const DEFAULT_PAGE_SIZE = 20
/** The search/list endpoint caps `max` at 40. */
export const MAX_PAGE_SIZE = 40
