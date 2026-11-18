/**
 * pandago API constants.
 *
 * pandago is the on-demand last-mile delivery service from Delivery Hero,
 * operating across SE Asia and the Middle East. The API is hosted on
 * deliveryhero.io infrastructure.
 *
 * Docs: https://on-demand-rider-docs.deliveryhero.io/
 */

// ── Base URLs ──────────────────────────────────────────────────────────────

/**
 * Production base URL (Asia-Pacific Southeast — covers most markets).
 * Replace `{countryCode}` with the ISO 3166-1 alpha-2 code stored in
 * credentials.extra.countryCode (default: 'sg').
 */
export const PANDAGO_API_BASE_APSE = 'https://pandago-api-apse.deliveryhero.io'

/**
 * Production base URL for Pakistan only (Asia-Pacific South).
 */
export const PANDAGO_API_BASE_APSO = 'https://pandago-api-apso.deliveryhero.io'

/**
 * Sandbox base URL (used when credentials.extra.sandbox === 'true').
 */
export const PANDAGO_API_SANDBOX = 'https://pandago-api-sandbox.deliveryhero.io'

/** API path template — country code is prepended before /api/v1 */
export const PANDAGO_API_PATH = '/api/v1'

// ── Auth endpoints ─────────────────────────────────────────────────────────

/** Production STS token endpoint */
export const PANDAGO_STS_PROD = 'https://sts.deliveryhero.io/oauth2/token'

/** Staging/sandbox STS token endpoint */
export const PANDAGO_STS_STAGE = 'https://sts-st.deliveryhero.io/oauth2/token'

/** OAuth2 grant type */
export const PANDAGO_GRANT_TYPE = 'client_credentials'

/** OAuth2 client_assertion_type for JWT bearer */
export const PANDAGO_CLIENT_ASSERTION_TYPE =
  'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'

/** JWT algorithm for signing client_assertion */
export const PANDAGO_JWT_ALG = 'RS256'

/** Default JWT expiry (10 minutes) */
export const PANDAGO_JWT_TTL_MS = 10 * 60 * 1000

// ── Supported countries ────────────────────────────────────────────────────

/** Countries served via the APSE endpoint */
export const PANDAGO_COUNTRIES_APSE = [
  'bd', // Bangladesh
  'hk', // Hong Kong
  'kh', // Cambodia
  'la', // Laos
  'mm', // Myanmar
  'my', // Malaysia
  'ph', // Philippines
  'sg', // Singapore
  'th', // Thailand
  'tw', // Taiwan
] as const

/** Countries served via the APSO endpoint */
export const PANDAGO_COUNTRIES_APSO = ['pk'] as const

// ── Misc ───────────────────────────────────────────────────────────────────

export const DEFAULT_COUNTRY_CODE = 'sg'
export const DEFAULT_PAGE_SIZE = 20
export const RATE_LIMIT_RPS = 10

/** Pandago developer portal */
export const PANDAGO_DOCS_URL = 'https://on-demand-rider-docs.deliveryhero.io/'
