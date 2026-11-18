/**
 * Tiendanube / Nuvemshop REST API constants.
 *
 * Tiendanube exposes two regional base URLs — one for Spanish-speaking
 * markets (tiendanube.com) and one for Brazilian Portuguese
 * (nuvemshop.com.br). Both are functionally identical; we expose both and
 * let callers pick via `TiendanubeAdapterConfig.region`.
 *
 * The API is versioned via the URL path (`/2025-03/`). We pin a known-good
 * version here so adapter behaviour is deterministic.
 *
 * Docs: https://tiendanube.github.io/api-documentation/intro
 */

export const API_VERSION = '2025-03'

/** Spanish-speaking regional endpoint (Argentina, Mexico, …) */
export const BASE_URL_ES = 'https://api.tiendanube.com'

/** Brazilian Portuguese regional endpoint */
export const BASE_URL_BR = 'https://api.nuvemshop.com.br'

/** OAuth2 authorize base URL */
export const OAUTH_AUTHORIZE_URL = 'https://www.tiendanube.com/apps/{app_id}/authorize'

/** OAuth2 token endpoint */
export const OAUTH_TOKEN_URL = 'https://www.tiendanube.com/apps/authorize/token'

export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 200

/**
 * Default OAuth scopes for a full-featured install. Callers can narrow this
 * via `TiendanubeAdapterConfig.scopes` if their app only needs a subset.
 *
 * Note: Tiendanube grants the corresponding read scope automatically when a
 * write scope is requested, so write-only scopes in this list imply reads.
 */
export const DEFAULT_SCOPES = [
  'read_content',
  'write_products',
  'write_orders',
  'write_customers',
  'read_locations',
]
