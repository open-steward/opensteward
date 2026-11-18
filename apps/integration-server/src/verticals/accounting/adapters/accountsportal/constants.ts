// AccountsPortal REST API constants.
//
// IMPORTANT: As of 2026, AccountsPortal does not expose a public REST API or
// OAuth developer programme. The URL values below are placeholders derived from
// common SaaS conventions and MUST be replaced with real values if/when
// AccountsPortal publishes official API documentation. Until then this adapter
// cannot be used in production and should be treated as a skeleton only.
//
// Reference: https://www.accountsportal.com (no /api or /developer section found)
export const AP_API_BASE = 'https://www.accountsportal.com/api/v1' // placeholder — unverified
export const AP_AUTH_URL = 'https://www.accountsportal.com/oauth/authorize' // placeholder — unverified
export const AP_TOKEN_URL = 'https://www.accountsportal.com/oauth/token' // placeholder — unverified

// Rate limit: conservative default for small SaaS accounting platforms
export const RATE_LIMIT_RPM = 60
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
