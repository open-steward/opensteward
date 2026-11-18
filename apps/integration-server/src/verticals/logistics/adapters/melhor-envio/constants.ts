// ─── Production ──────────────────────────────────────────────────────────────

export const MELHOR_ENVIO_API_BASE = 'https://www.melhorenvio.com.br/api/v2/'
export const MELHOR_ENVIO_OAUTH_AUTHORIZE_URL = 'https://www.melhorenvio.com.br/oauth/authorize'
export const MELHOR_ENVIO_OAUTH_TOKEN_URL = 'https://www.melhorenvio.com.br/oauth/token'

// ─── Sandbox ─────────────────────────────────────────────────────────────────

export const MELHOR_ENVIO_SANDBOX_API_BASE = 'https://sandbox.melhorenvio.com.br/api/v2/'
export const MELHOR_ENVIO_SANDBOX_AUTHORIZE_URL = 'https://sandbox.melhorenvio.com.br/oauth/authorize'
export const MELHOR_ENVIO_SANDBOX_TOKEN_URL = 'https://sandbox.melhorenvio.com.br/oauth/token'

// ─── OAuth2 scopes ───────────────────────────────────────────────────────────

/**
 * Scopes required for full adapter functionality:
 * - shipping-calculate: freight rate calculation
 * - shipping-checkout: purchase/checkout freight
 * - shipping-generate: generate shipping labels
 * - shipping-print:    retrieve label print URLs
 * - shipping-tracking: retrieve tracking events
 * - shipping-companies: list available carriers
 * - cart-read / cart-write: shopping cart operations
 * - orders-read: list/read orders
 */
export const MELHOR_ENVIO_SCOPES = [
  'shipping-calculate',
  'shipping-checkout',
  'shipping-generate',
  'shipping-print',
  'shipping-tracking',
  'shipping-companies',
  'cart-read',
  'cart-write',
  'orders-read',
]

// ─── Access token lifetime ────────────────────────────────────────────────────

/** Melhor Envio access tokens are valid for 30 days (2 592 000 s). */
export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Refresh tokens are valid for 45 days (3 888 000 s). */
export const REFRESH_TOKEN_TTL_MS = 45 * 24 * 60 * 60 * 1000

/** Refresh the access token when fewer than 2 days remain. */
export const TOKEN_REFRESH_BUFFER_MS = 2 * 24 * 60 * 60 * 1000

export const RATE_LIMIT_RPS = 10
