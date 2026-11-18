// Brex OAuth2 endpoints
export const BREX_AUTH_URL = 'https://accounts-api.brex.com/oauth2/default/v1/authorize'
export const BREX_TOKEN_URL = 'https://accounts-api.brex.com/oauth2/default/v1/token'

// REST API base URL (production only — Brex does not expose a separate sandbox URL)
export const BREX_API_BASE = 'https://platform.brexapis.com'

// Default OAuth2 scopes required for accounting use-cases:
// openid + offline_access are mandatory; resource scopes are additive
export const BREX_DEFAULT_SCOPES = [
  'openid',
  'offline_access',
  'accounts.cash.readonly',
  'transactions.cash.readonly',
  'transactions.card.readonly',
  'vendors',
  'expenses.card.readonly',
  'companies.readonly',
]

// Pagination — cursor-based: `limit` and `cursor` in, `items` and `next_cursor`
// out. Each endpoint's documented `limit` ceiling:
//
//   every list (https://developer.brex.com/guides/pagination.md):
//     "It can be set to a number up to 1000. When it is set to a value greater
//      than 1000, a 400 Bad Request error will be returned."
//   GET /v3/accounting/records (queryaccountingrecords.md):
//     "The maximum is 500; requests with a higher value are rejected with a 400 error."
//   GET /v1/expenses/card (listexpenses_1.md):
//     "can't be greater than 100"
export const LIST_MAX_PAGE_SIZE = 1000
export const ACCOUNTING_RECORDS_MAX_PAGE_SIZE = 500
export const CARD_EXPENSES_MAX_PAGE_SIZE = 100

// The adapter's declared `capabilities.maxPageSize`: the lowest ceiling above,
// so the router and the sync worker ask every list for a size it can send as is.
export const MAX_PAGE_SIZE = CARD_EXPENSES_MAX_PAGE_SIZE
export const DEFAULT_PAGE_SIZE = 100

// Rate limit: 1000 req / 60 s
export const RATE_LIMIT_RPM = 1000
