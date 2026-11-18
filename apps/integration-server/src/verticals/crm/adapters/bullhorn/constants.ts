// Bullhorn CRM — Australia/Global recruitment CRM
// Docs: https://bullhorn.github.io/rest-api-docs/
//
// Auth is a two-step process:
//   1. OAuth2 authorization code → get `code`
//   2. GET /rest-services/login?version=2.0&access_token=<code>
//      → returns { restUrl, BhRestToken }
//
// restUrl is the tenant-specific base URL stored in credentials.extra.instanceUrl
// BhRestToken is passed as a query param on every subsequent request

export const OAUTH_AUTH_URL = 'https://auth.bullhornstaffing.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://auth.bullhornstaffing.com/oauth/token'
export const LOGIN_URL = 'https://rest.bullhornstaffing.com/rest-services/login'
export const DEFAULT_PAGE_SIZE = 25
