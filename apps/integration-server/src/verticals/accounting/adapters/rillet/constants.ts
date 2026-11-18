export const RILLET_API_BASE = 'https://api.rillet.com'
/**
 * Sent as `X-Rillet-API-Version` on every request. "We strongly recommend
 * always specifying an explicit version" (https://docs.api.rillet.com/docs/getting-started.md,
 * Versioning). Every reference page under https://docs.api.rillet.com/reference/
 * is `"info": { "version": "v4.0" }` with the header value `"4"`
 * (`x-readme.headers`); the v3.0 pages live under /v3.0/reference/. The
 * transforms follow v4.0: credit memo `applications[]`, `applied_amount` and
 * `remaining_amount` exist only in v4.0, and item `quantity` is a decimal
 * string there (a number in v3.0).
 */
export const RILLET_API_VERSION = '4'

// Rate limit: 60 req per rolling 60-second window
export const RATE_LIMIT_RPM = 60
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25
