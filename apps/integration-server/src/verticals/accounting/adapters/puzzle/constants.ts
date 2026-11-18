export const PUZZLE_AUTH_URL = 'https://api.puzzle.io/rest/v0/oauth/authorize'
export const PUZZLE_TOKEN_URL = 'https://api.puzzle.io/rest/v0/oauth/token'
export const PUZZLE_API_BASE = 'https://api.puzzle.io/rest/v0'

// Rate limit not publicly documented; conservative default
export const RATE_LIMIT_RPM = 120
// No maximum page size is documented: `count` (and `limit` on journalEntries)
// is a bare integer in every spec, so the caller's limit is sent as is.
export const DEFAULT_PAGE_SIZE = 50

// GET /company/{id}/transactions requires `startDate` and `endDate`
// (YYYY-MM-DD). The unified API has no date filter to map onto them, so a
// list asks for every date: from before any company's books begin to a date
// no transaction reaches.
export const TRANSACTIONS_START_DATE = '1900-01-01'
export const TRANSACTIONS_END_DATE = '9999-12-31'

// Default scopes for full accounting read + write access
export const DEFAULT_SCOPES = [
  'read:company',
  'write:invoice',
  'write:bill',
  'write:customer',
  'write:vendor',
  'write:journal',
  'write:transaction',
]
