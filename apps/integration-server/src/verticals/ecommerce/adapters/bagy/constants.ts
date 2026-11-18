/**
 * Bagy REST API constants.
 *
 * Bagy's API is served from the merchant's own store domain. The full base URL
 * is `https://{api_address}/web_api` where `api_address` is the store URL
 * returned during the OAuth authorisation flow. There is no separate sandbox
 * environment — Bagy provides a shared test store for all integrators.
 *
 * Auth: OAuth 2.0. The `access_token` is appended as a query parameter to
 * every request. Tokens expire after ~24 hours; refresh via the `/auth` endpoint.
 *
 * Docs: https://developers.bagy.com.br/
 */

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50
