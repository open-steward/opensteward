// Ramp Developer API v1
// Production: https://api.ramp.com
// Sandbox/Demo: https://demo-api.ramp.com

export const RAMP_AUTH_URL = 'https://app.ramp.com/v1/oauth/authorize'
export const RAMP_TOKEN_URL = 'https://api.ramp.com/developer/v1/token'
export const RAMP_API_BASE = 'https://api.ramp.com/developer/v1/'

export const RAMP_SANDBOX_AUTH_URL = 'https://demo.ramp.com/v1/oauth/authorize'
export const RAMP_SANDBOX_TOKEN_URL = 'https://demo-api.ramp.com/developer/v1/token'
export const RAMP_SANDBOX_API_BASE = 'https://demo-api.ramp.com/developer/v1/'

// Default scopes for accounting integration
export const DEFAULT_SCOPES = [
  'business:read',
  'transactions:read',
  'bills:read',
  'bills:write',
  'accounting:read',
  'accounting:write',
  'users:read',
  'departments:read',
  'vendors:read',
  'reimbursements:read',
  'receipts:read',
  'offline_access',
]

// Pagination: keyset (`start` + `page_size`, next page at `page.next`).
// page_size: "The value must be between 2 and 100." (every list endpoint the
// adapter reads, https://docs.ramp.com/openapi/developer-api.json)
export const MIN_PAGE_SIZE = 2
export const MAX_PAGE_SIZE = 100
/** The size a direct call with no `limit` asks for: the most one page holds. */
export const DEFAULT_PAGE_SIZE = 100
