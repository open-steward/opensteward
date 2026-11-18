// Bigcapital REST API
// Docs: https://docs.bigcapital.app/api-reference/introduction
//
// Bigcapital is primarily a self-hosted open-source application.
// The cloud offering lives at api.bigcapital.com, but customers running their
// own instances supply a custom base URL at credential-entry time via the
// `baseUrl` form field (stored in credentials.extra.baseUrl).
// This constant is used only when no customer-supplied baseUrl is present.
export const BIGCAPITAL_API_BASE = 'https://api.bigcapital.com/api/'

// Rate limit: 2 req/s (120 req/min)
export const RATE_LIMIT_RPS = 2
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
