/**
 * Spendesk Public API constants
 *
 * Production:  https://public-api.spendesk.com
 * Sandbox:     https://public-api.demo.spendesk.com
 *   (the OpenAPI `servers` list on every reference page:
 *   {"url":"https://public-api.demo.spendesk.com","description":"Sandbox"})
 *
 * Auth (server-to-server): POST /v1/auth/token
 *   Header: Authorization: Basic base64(client_id:client_secret)
 *   Body:   grant_type=client_credentials [&scope=...]
 *   Responds with: { access_token, token_type: "Bearer" }
 *   (No refresh token — re-request when expired.)
 *
 * Auth (user-facing PKCE):
 *   Authorize:     GET  /v1/oauth2/authorize
 *   Token create:  POST /v1/oauth2/token/create  (authorization_code + code_verifier)
 *   Token refresh: POST /v1/oauth2/token/refresh
 *
 * Docs: https://developer.spendesk.com/reference/introduction
 */

// Base URLs
export const SPENDESK_API_BASE = 'https://public-api.spendesk.com'
export const SPENDESK_SANDBOX_API_BASE = 'https://public-api.demo.spendesk.com'

// Auth endpoints
export const SPENDESK_TOKEN_URL = 'https://public-api.spendesk.com/v1/auth/token'
export const SPENDESK_AUTH_URL = 'https://public-api.spendesk.com/v1/oauth2/authorize'
export const SPENDESK_PKCE_TOKEN_URL = 'https://public-api.spendesk.com/v1/oauth2/token/create'
export const SPENDESK_PKCE_REFRESH_URL = 'https://public-api.spendesk.com/v1/oauth2/token/refresh'

// Default OAuth2 scopes for an accounting integration.
//
// v1 has no synchronous payables list ("The synchronous endpoint to retrieve
// payables has been removed in favor of the asynchronous one"), so expenses,
// invoices and credit memos list through POST /v1/payables/search, which
// allows only `experimental:payable-search:read`. The chart of accounts is
// GET /v1/experimental/accounts, allowed `experimental:chart-of-accounts:read`.
export const SPENDESK_DEFAULT_SCOPES = [
  'payable:read',
  'payable-attachment:read',
  'settlement:read',
  'supplier:read',
  'user:read',
  'analytical-field:read',
  'experimental:payable-search:read',
  'experimental:chart-of-accounts:read',
]

// API paths
export const PATHS = {
  /** POST — "Searches payables using filters with cursor-based pagination." */
  payableSearch: '/v1/payables/search',
  /** GET — "Retrieves a single payable by its ID." */
  payable: (id: string) => `/v1/payables/${encodeURIComponent(id)}`,
  payableAttachments: (id: string) => `/v1/payables/${encodeURIComponent(id)}/attachments`,
  settlements: '/v1/settlements',
  suppliers: '/v1/suppliers',
  /** GET — "Returns accounts from accounting integrations." */
  accounts: '/v1/experimental/accounts',
  /** GET — "Returns a single account by id." */
  account: (id: string) => `/v1/experimental/accounts/${encodeURIComponent(id)}`,
  users: '/v1/users',
  expenseCategories: '/v1/expense-categories',
} as const

// "The maximum page size across all endpoints is now 30." (v1 changelog,
// https://developer.spendesk.com/changelog/announcing-v1-of-the-spendesk-api).
// Applied to every list, including the payables search `limit` and the
// accounts `fetch`, whose own references state no maximum.
export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 30
