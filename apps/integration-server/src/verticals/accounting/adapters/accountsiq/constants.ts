// AccountsIQ uses a SOAP-based API, not REST+OAuth2.
// The API base URL includes a region code (e.g. "eu1", "us1") stored in credentials.extra.regionCode.
// Integration_2_0 endpoint format: https://{regionCode}.accountsiq.com/system/dashboard/integration/integration_2_0.asmx
// Authentication uses the OAuth 2.0 Client Credentials Flow via SOAP methods TokenGet() and TokenRefresh()
// (not standard /oauth/authorize or /oauth/token HTTP endpoints).
export const ACCOUNTSIQ_API_HOST = 'accountsiq.com'
export const ACCOUNTSIQ_API_PATH = '/system/dashboard/integration/integration_2_0.asmx'
// AccessToken TTL: 60 minutes; RefreshToken TTL: 3 months
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000

// Rate limit: access token valid 60 min; no documented req/sec limit
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
