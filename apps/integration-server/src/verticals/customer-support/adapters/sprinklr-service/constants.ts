/**
 * Sprinklr Service API constants.
 *
 * Production:  api3.sprinklr.com  (env segment omitted / empty)
 * Other envs:  api3.sprinklr.com/{env}, e.g. prod0, prod2
 *
 * The client inserts the env segment from credentials.extra.env.
 * Auth: OAuth 2.0 Authorization Code grant.
 *   Authorize: https://api3.sprinklr.com/{env}/oauth/authorize
 *   Token:     https://api3.sprinklr.com/{env}/oauth/token
 *
 * Request headers:
 *   Authorization: Bearer {access_token}
 *   key: {api_key}           <-- required alongside bearer token
 *
 * Hosts: every first-party page (Getting Started, Authorize, OAuth 2.0 for
 * Customers/Partners, each endpoint page) names api3.sprinklr.com.
 */

/** Base URL template — {env} replaced at runtime ('', 'sandbox', 'prod2', etc.) */
export const API_BASE_URL_TEMPLATE = 'https://api3.sprinklr.com/{env}'

/** OAuth 2.0 endpoints */
export const OAUTH_AUTHORIZE_URL_TEMPLATE = 'https://api3.sprinklr.com/{env}/oauth/authorize'
export const OAUTH_TOKEN_URL_TEMPLATE = 'https://api3.sprinklr.com/{env}/oauth/token'

/** Default env segment for production (empty string = no path prefix) */
export const DEFAULT_ENV = ''

export const DEFAULT_PAGE_SIZE = 50
export const DEFAULT_SCOPES: string[] = []
