/**
 * Nitro Sign constants.
 *
 * Every Nitro Sign call — the token endpoint included — goes to the
 * connection's regional host, one of the `servers` of the Nitro Sign Public
 * API (https://api.gonitro.dev/openapi.json, "Nitro Sign Public API", 0.1).
 */

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Nitro Sign Public API hosts — the `servers` of
 * https://api.gonitro.dev/openapi.json: `https://api.gonitro.dev` (Europe),
 * `https://api.us.gonitro.dev` (North America), `https://api.au.gonitro.dev`
 * (Australia). Paths such as `/oauth/token` and
 * `/sign/envelopes/{envelopeID}/participants` hang directly off the host.
 *
 * A connection names its region's host on `credentials.extra.signApiBaseUrl`;
 * there is no default region, because a wrong one answers 404/401 for an
 * account that exists elsewhere.
 */
export const SIGN_API_SERVERS = [
  { url: 'https://api.gonitro.dev', description: 'Europe' },
  { url: 'https://api.us.gonitro.dev', description: 'North America' },
  { url: 'https://api.au.gonitro.dev', description: 'Australia' },
] as const

export const SIGN_API_HOSTS: readonly string[] = SIGN_API_SERVERS.map((s) => s.url)

/**
 * `POST /oauth/token` — "exchanges client credentials for an access token
 * using the OAuth 2.0 client credentials flow" (operationId
 * `getTokenRfc6749`, `security: []`).
 */
export const TOKEN_PATH = '/oauth/token'
