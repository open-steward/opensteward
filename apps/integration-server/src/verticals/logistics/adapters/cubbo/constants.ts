// Cubbo 3PL fulfillment platform — API constants
//
// Docs: Cubbo's public Postman documenter at https://developers.cubbo.com/,
// whose collection JSON is served at
// https://developers.cubbo.com/api/collections/16525878/UV5dcu1j?environment=16526084-7447733d-2f03-4c08-9eb6-129b4b8fe37d&segregateAuth=true&versionTag=latest
// Its overview lists "Production https://api.cubbo.com/v1" and
// "Staging https://api-staging.cubbo.com/v1"; this adapter uses production.

/** Cubbo Clients API base URL. Paths are appended directly (e.g. `orders`). */
export const CUBBO_API_BASE = 'https://api.cubbo.com/v1/'

/**
 * Token endpoint. The collection's "Auth - Get token" request is
 * `POST https://api.cubbo.com/v1/auth/token` with a JSON body
 * `{ "client_id", "client_secret" }`, answering `{ token, expires_in, type }`.
 */
export const CUBBO_TOKEN_URL = 'https://api.cubbo.com/v1/auth/token'

/**
 * GET /orders paging. The request description reads: "page (default 1) and
 * per_page (default 10, max 100 — a larger value is silently clamped to 100)."
 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100
