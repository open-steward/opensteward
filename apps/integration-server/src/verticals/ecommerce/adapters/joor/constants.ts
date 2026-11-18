/**
 * JOOR API constants.
 *
 * JOOR exposes two API versions:
 *  - v4  (primary): products, SKUs, collections, orders, prices
 *  - v2  (legacy):  compatible with v4 credentials
 *
 * Auth is a password-grant OAuth2 flow against the atlas auth service.
 * The resulting Bearer token is sent as `Authorization: Bearer <token>`.
 *
 * Docs: https://api-docs.jooraccess.com/docs/overview
 */

/** v4 REST base URL — production. */
export const API_BASE_URL = 'https://api.joor.com/v4'

/** v4 REST base URL — sandbox. */
export const API_BASE_URL_SANDBOX = 'https://apisandbox.jooraccess.com/v4'

/** Auth (token) endpoint — production. */
export const AUTH_URL = 'https://atlas.jooraccess.com/auth/'

/** Auth (token) endpoint — sandbox. */
export const AUTH_URL_SANDBOX = 'https://atlas-sandbox.jooraccess.com/auth/'

/**
 * JOOR uses a Resource Owner Password Credentials grant (not Authorization
 * Code).  `grant_type=password` issues a new token;
 * `grant_type=refresh_token` rotates it before expiry.
 */
export const GRANT_TYPE_PASSWORD = 'password'
export const GRANT_TYPE_REFRESH = 'refresh_token'

/**
 * Orders support page-based pagination; products are returned in one
 * large batch (~4 000 items max).
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 250
