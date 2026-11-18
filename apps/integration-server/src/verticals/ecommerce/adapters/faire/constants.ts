/**
 * Faire External API v2 constants.
 *
 * Faire is a B2B wholesale marketplace. The External API is brand-facing:
 * brands authorise an application once (OAuth2) and it can read their
 * products and wholesale orders.
 *
 * Docs: https://developers.faire.com/docs (a Stoplight SPA; the OpenAPI 3.0.3
 * spec it renders is embedded in https://cdn.faire.com/static/js/784.fd6421f2.chunk.js).
 */

/**
 * Production REST base URL. The spec's only server:
 * `servers[0].url = "https://www.faire.com/external-api/v2"`, "Production server".
 * The adapter's former `https://www.faire.com/api/v2` answers 404 on /products.
 */
export const BASE_URL = 'https://www.faire.com/external-api/v2'

/**
 * OAuth permission URL. Docs: "the user needs to be redirected to a URL of the
 * following format: `https://faire.com/oauth2/authorize?applicationId={YOUR_APP_ID}&scope=SPECIFIC_PERMISSION&state=...&redirectUrl=https://example.com.`"
 */
export const OAUTH_AUTHORIZE_URL = 'https://faire.com/oauth2/authorize'

/** Docs: "HTTP Request `POST https://www.faire.com/api/external-api-oauth2/token`". */
export const OAUTH_TOKEN_URL = 'https://www.faire.com/api/external-api-oauth2/token'

/**
 * Page sizes, from the first-party legacy docs for these same endpoints
 * (faire.github.io/external-api-v2-docs, archived 2025-01-14; the current spec
 * types `limit` as a bare integer):
 *   GET /products `limit` — default 50, "Must be between 10-250."
 *   GET /orders   `limit` — default 50, "Must be between 10-50."
 */
export const DEFAULT_PAGE_SIZE = 50
export const MIN_PAGE_SIZE = 10
export const MAX_PRODUCTS_PAGE_SIZE = 250
export const MAX_ORDERS_PAGE_SIZE = 50

/**
 * Default OAuth scopes, named as in the docs' Permissions table
 * (`READ_INVENTORIES`, not `READ_INVENTORY`). Callers can narrow this via
 * `FaireAdapterConfig.scopes`.
 */
export const DEFAULT_SCOPES = [
  'READ_PRODUCTS',
  'WRITE_PRODUCTS',
  'READ_ORDERS',
  'WRITE_ORDERS',
  'READ_INVENTORIES',
  'WRITE_INVENTORIES',
]
