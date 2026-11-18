// API key is obtained from https://app.maxio.com/api_keys
export const MAXIO_SETTINGS_URL = 'https://app.maxio.com/api_keys'

// Base URL uses the customer's subdomain: https://{subdomain}.chargify.com/
// Collected per customer by the Connect Link form (credentials.extra.subdomain).
/** One DNS label — the only shape accepted as a chargify.com site subdomain. */
export const MAXIO_SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// Rate limit: 100 req/min — honour Retry-After header on 429
export const RATE_LIMIT_RPM = 100
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200
