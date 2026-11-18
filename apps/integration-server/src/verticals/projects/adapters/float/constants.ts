/**
 * Float REST API.
 *
 * Float exposes a single production REST surface at https://api.float.com/v3.
 * Every resource is a flat, plural path under that root, e.g.
 *   https://api.float.com/v3/projects
 *
 * There is no separate sandbox/test host — production is the only base URL.
 *
 * Authentication is a long-lived bearer token generated from the user's Float
 * Account Settings → Integrations page (no OAuth2 authorization-code flow), so
 * credentials are collected through the Connect Link form (`simpleApiKey`).
 * Float additionally requires a descriptive `User-Agent` on every request.
 *
 * Docs: https://developer.float.com/overview_authentication.html
 */
export const API_BASE_URL = 'https://api.float.com/v3'

/** Where a user generates their API access token. */
export const TOKEN_HELP_URL = 'https://developer.float.com/overview_authentication.html'

/** Float mandates a User-Agent identifying the integration + a contact email. */
export const USER_AGENT = 'OpenSteward (integrations@opensteward.com)'

/**
 * Float pages collections with a 1-based `page` query parameter and a
 * `per-page` size (default 50, maximum 200).
 */
export const DEFAULT_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 200
