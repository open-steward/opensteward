// WhiteBooks API — GST Suvidha Provider (India)
// Auth:   OAuth2 client-credentials  →  Bearer token (1 h TTL)
// Docs:   https://whitebooks.in/api/e-invoice-api-for-developers/
//         https://whitebooks.in/api/gst-api-for-developers/

// ── Base URLs ─────────────────────────────────────────────────────────────────
export const WHITEBOOKS_EINVOICE_API_PROD   = 'https://api.whitebooks.in/einvoice'
export const WHITEBOOKS_EINVOICE_API_SAND   = 'https://apisandbox.whitebooks.in/einvoice'
export const WHITEBOOKS_GST_API_PROD        = 'https://api.whitebooks.in/gst'
export const WHITEBOOKS_GST_API_SAND        = 'https://apisandbox.whitebooks.in/gst'

// Token endpoints
export const WHITEBOOKS_TOKEN_URL_PROD      = 'https://api.whitebooks.in/gst/oauth/token'
export const WHITEBOOKS_TOKEN_URL_SAND      = 'https://apisandbox.whitebooks.in/gst/oauth/token'

// Default: production
export const WHITEBOOKS_EINVOICE_API_BASE   = WHITEBOOKS_EINVOICE_API_PROD
export const WHITEBOOKS_GST_API_BASE        = WHITEBOOKS_GST_API_PROD
export const WHITEBOOKS_TOKEN_URL           = WHITEBOOKS_TOKEN_URL_PROD

// e-Invoice API version path segment (NIC IRP schema V1.03)
export const EINVOICE_VERSION = 'V1_03'

// Pagination — WhiteBooks does not expose paginated accounting resource lists
// via their public API; these constants are kept for forward-compat.
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE     = 1000

// Rate limits (Starter plan / sandbox)
export const RATE_LIMIT_RPM = 60
