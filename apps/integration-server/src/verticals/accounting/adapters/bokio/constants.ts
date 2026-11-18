export const BOKIO_AUTH_URL = 'https://api.bokio.se/v1/authorize'
export const BOKIO_TOKEN_URL = 'https://api.bokio.se/v1/token'
export const BOKIO_API_BASE = 'https://api.bokio.se/v1/'

/**
 * Sent when the platform config selects no scopes. Bokio's /authorize
 * rejects a request without one ("invalid_scope: Missing scope parameter"),
 * so an empty list can never connect. These are the read scopes behind what
 * this adapter reads, each the "**Scope:**" line of the endpoint page (the
 * Scopes table, https://docs.bokio.se/reference/scopes, lists all but the
 * two [Preview] ones). Writes need the matching `:write` scope selected
 * explicitly (`invoices:write` also creates credit notes).
 */
export const BOKIO_DEFAULT_SCOPES = [
  'journal-entries:read',
  'invoices:read',
  'customers:read',
  'credit-notes:read',
  'chart-of-accounts:read',
  'company-information:read',
  // Organization.fiscalYearEndMonth (get-fiscal-years.md).
  'fiscal-years:read',
  // [Preview] supplier invoices → bills (get-supplier-invoices.md).
  'supplier-invoices:read',
  // [Preview] suppliers → contacts (get-suppliers.md).
  'suppliers:read',
  // Not uploads:read: the adapter only links a bill attachment to
  // download-upload.md and never calls it. It stays in recommendedScopes for
  // a caller that follows the link.
]

/**
 * `pageSize` on every paged list: "default": 25, "maximum": 100 (e.g. the
 * parameters of https://docs.bokio.se/reference/get-invoice.md; the same
 * numbers on https://docs.bokio.se/reference/pagination.md).
 */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25
