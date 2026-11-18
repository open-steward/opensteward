/**
 * Signority REST API constants.
 *
 * Signority exposes three host environments — sign.signority.com (prod),
 * sandbox.signority.com (sandbox), and test.signority.com (test). Resource
 * paths nest under `/api/v1` and `/api/v2`; the base below pins the prod
 * host + `/api` prefix and the per-version segment is added by each call.
 *
 * Auth is HTTP Basic with the API key as the username and an empty password
 * (`Authorization: Basic base64("<apiKey>:")`).
 *
 * Docs: https://www.signority.com/api-doc/
 */

/** Production API base (host + `/api` prefix; version segment added per call). */
export const API_BASE_URL = 'https://sign.signority.com/api'

/** Sandbox API base — identical path layout to production. */
export const SANDBOX_API_BASE_URL = 'https://sandbox.signority.com/api'

/** Document list pagination. Signority uses `pageIndex` (1-based) + `pageSize`. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Signority document-level `signingStatus` codes.
 *   51 DRAFT, 52 IN_PROGRESS, 53 COMPLETED, 54 REJECTED.
 */
export const SIGNING_STATUS = {
  DRAFT: 51,
  IN_PROGRESS: 52,
  COMPLETED: 53,
  REJECTED: 54,
} as const

/**
 * Signority `documentType` codes.
 *   5 Document, 6 Template Link, 7 Regular Template, 8 Bulk Template.
 */
export const DOCUMENT_TYPE = {
  DOCUMENT: 5,
  TEMPLATE_LINK: 6,
  REGULAR_TEMPLATE: 7,
  BULK_TEMPLATE: 8,
} as const

/** documentType codes that represent reusable templates rather than documents. */
export const TEMPLATE_DOCUMENT_TYPES: number[] = [
  DOCUMENT_TYPE.REGULAR_TEMPLATE,
  DOCUMENT_TYPE.BULK_TEMPLATE,
  DOCUMENT_TYPE.TEMPLATE_LINK,
]
