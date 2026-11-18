/**
 * Coda REST API (v1).
 *
 * Coda is single-host SaaS — there is no sandbox/region split. Every request
 * goes to `https://coda.io/apis/v1`, authenticated with a long-lived API
 * token in the `Authorization: Bearer <token>` header. Tokens are minted by
 * the user from their account settings; there is no OAuth2 authorization-code
 * flow exposed for first-party API access, so credentials are collected via
 * the Connect Link form (a single API-key field).
 *
 * Docs: https://coda.io/developers/apis/v1
 */
export const API_BASE_URL = 'https://coda.io/apis/v1'

/** Where a user mints an API token (account settings → API). */
export const TOKEN_HELP_URL = 'https://coda.io/account'

/**
 * Collections page with an opaque `pageToken` cursor and a `limit` (≥1,
 * default 25 upstream). Responses carry `items`, `nextPageToken`, and
 * `nextPageLink`. We request a larger page to cut round-trips.
 */
export const DEFAULT_PAGE_SIZE = 100
