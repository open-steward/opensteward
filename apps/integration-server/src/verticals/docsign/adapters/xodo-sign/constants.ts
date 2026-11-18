/**
 * Xodo Sign (formerly eversign) REST API constants.
 *
 * Xodo Sign is a lightweight RESTful JSON API authenticated with a single
 * per-account API access key (passed as the `access_key` query parameter)
 * plus a `business_id` query parameter that scopes every request to one
 * business entity under the account. There is no sandbox host — sandbox
 * mode is requested per-document via a `sandbox=1` flag, so the same base
 * URL serves both. Timestamps come back as Unix epoch seconds.
 *
 * Docs: https://eversign.com/api/documentation
 */

/** Base URL — every resource path is appended to this (e.g. `/document`). */
export const API_BASE_URL = 'https://api.eversign.com/api'

/** Resource paths (relative to API_BASE_URL). */
export const BUSINESS_PATH = 'business'
export const DOCUMENT_PATH = 'document'

/**
 * `type` filter values accepted by the document-list endpoint. `all`
 * returns every document the account can see; the rest narrow by state.
 */
export const DOCUMENT_LIST_TYPES = [
  'all',
  'my_action_required',
  'waiting_for_others',
  'completed',
  'drafts',
  'cancelled',
] as const

/** `type=templates` returns reusable templates rather than documents. */
export const TEMPLATE_LIST_TYPE = 'templates'

/** Xodo Sign caps a single list page at 500 items. */
export const DEFAULT_PAGE_SIZE = 500
export const MAX_PAGE_SIZE = 500
