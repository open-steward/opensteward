// Confirmed by live probe (2026-09-13): api.easyship.com 404s every /2024-09
// route ({"error":"Route not found"}); public-api.easyship.com answers 401
// invalid_token on the same routes (i.e. the route exists there). Matches
// the vendor spec's `servers` entry https://public-api.easyship.com.
export const EASYSHIP_API_BASE = 'https://public-api.easyship.com/2024-09/'
// Sandbox host is public-api-sandbox.easyship.com, NOT api-sandbox — the
// latter 404s on live probe too.
export const EASYSHIP_SANDBOX_API_BASE = 'https://public-api-sandbox.easyship.com/2024-09/'

export const EASYSHIP_DASHBOARD_URL = 'https://app.easyship.com/connect'

export const RATE_LIMIT_RPS = 10

// `oauth2`, not `oauth`. Confirmed by unauthenticated live probe
// (2026-09-15), which separates a wrong path from a missing credential
// without needing either:
//   POST /oauth/token  -> 404 {"error":"Route not found"}
//   POST /oauth2/token -> 401 {"error":"invalid_client", ...}
// A 401 invalid_client is a real token endpoint answering correctly; a 404 is
// not an endpoint. Matches the vendor reference,
// https://developers.easyship.com/reference/oauth2_token.
export const EASYSHIP_TOKEN_URL = 'https://api.easyship.com/oauth2/token'
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// List paging, 2024-09 spec (https://developers.easyship.com/reference/couriers_index,
// .../manifests_index): `per_page` "Number of records per page to fetch,
// default: `20`", schema minimum 1, maximum 100.
export const EASYSHIP_MAX_PER_PAGE = 100
export const EASYSHIP_DEFAULT_PER_PAGE = 20
