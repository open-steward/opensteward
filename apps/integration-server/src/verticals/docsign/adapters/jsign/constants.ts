/**
 * jSign REST API constants.
 *
 * jSign (by Consensus Cloud Solutions / Cygnature) exposes a single REST
 * host at api.jsign.com. The API uses Bearer-token (JWT) authentication;
 * tokens are obtained by POSTing credentials to /api/v2/Authorization/token.
 * Every request also requires the `app_auth_type: jsign-oauth2` header.
 *
 * Swagger/OpenAPI spec: https://api.jsign.com/swagger/v2/swagger.json
 * Swagger UI:           https://api.jsign.com/
 */
export const API_VERSION = 'v2'

/** Base URL for all jSign REST API requests. */
export const API_BASE_URL = 'https://api.jsign.com'

/**
 * Header required on every request; value is always the literal string
 * `jsign-oauth2`.
 */
export const APP_AUTH_TYPE_HEADER = 'app_auth_type'
export const APP_AUTH_TYPE_VALUE = 'jsign-oauth2'

/** Token endpoint for email+password login. */
export const TOKEN_URL = `${API_BASE_URL}/api/v2/Authorization/token`

/** Refresh endpoint. */
export const REFRESH_TOKEN_URL = `${API_BASE_URL}/api/v2/Authorization/refresh_token`

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
