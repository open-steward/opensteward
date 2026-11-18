/**
 * Circle Mint REST API constants.
 *
 * Circle exposes two hosts with an identical endpoint surface: a sandbox for
 * test integrations and production. Operators point a connection at production
 * via the connection's base-URL override; we default to sandbox so a freshly
 * connected sandbox key works out of the box.
 *
 * All endpoints live under the `/v1` prefix and every response is wrapped in a
 * `{ "data": ... }` envelope. Lists use cursor pagination via `pageSize` plus
 * `pageAfter` / `pageBefore`.
 *
 * Docs: https://developers.circle.com/circle-mint/circle-apis-production-sandbox-environments
 */
export const API_BASE_URL = 'https://api-sandbox.circle.com'
export const PRODUCTION_BASE_URL = 'https://api.circle.com'

/** Page size for cursor-paginated list endpoints (`pageSize` query param). */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50
