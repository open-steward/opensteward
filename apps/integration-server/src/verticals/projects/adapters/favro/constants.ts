/**
 * Favro REST API (v1).
 *
 * Favro is single-host SaaS — there is no sandbox/region split. Every request
 * goes to `https://favro.com/api/v1`, authenticated with HTTP Basic Auth using
 * the user's email and a personal API token (`Authorization: Basic
 * base64(email:apiToken)`). Tokens are minted by the user from
 * My profile → API Tokens; there is no OAuth2 authorization-code flow exposed,
 * so credentials are collected via the Connect Link form (email + API token +
 * organization id fields).
 *
 * Every organization-scoped request must also carry an `organizationId` HTTP
 * header — Favro returns 400 for organization routes that omit it.
 *
 * Docs: https://favro.com/developer/
 */
export const API_BASE_URL = 'https://favro.com/api/v1'

/** Where a user mints a personal API token (My profile → API Tokens). */
export const TOKEN_HELP_URL = 'https://favro.com/developer/'

/**
 * Paginated responses carry `{ requestId, page, pages, limit, entities }` and
 * page via `?requestId=<id>&page=<n>` (0-based). The page size is fixed:
 * `limit` is "The number of entities per page. This should always be 100." No
 * request parameter sets it, so the adapter cuts the caller's page out of
 * Favro's 100-entity pages (`pageByRows`). Also the caller's page size when
 * a list is called without one.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Response header naming the server process that handled a request; echoed
 * on the request for the next page of a paginated list ("Routing").
 */
export const BACKEND_HEADER = 'X-Favro-Backend-Identifier'
