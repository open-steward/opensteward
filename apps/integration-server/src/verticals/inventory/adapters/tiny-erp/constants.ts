/**
 * Olist Tiny ERP API v3 constants.
 *
 * Auth: OAuth 2.0 Authorization Code flow via Keycloak-hosted identity provider.
 * Base: https://api.tiny.com.br/public-api/v3
 *   ('https://erp.tiny.com.br/api/v3' — the old base — returns 403 on every
 *   route, with or without a Bearer token; confirmed by live probe 2026-09-13.)
 * Accounts: https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect
 */
export const API_BASE_URL = 'https://api.tiny.com.br/public-api/v3'

export const OAUTH_AUTHORIZE_URL =
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth'
export const OAUTH_TOKEN_URL =
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token'

export const DEFAULT_PAGE_SIZE = 100

/**
 * Minimum OAuth2 scopes for read-only inventory integration.
 * Tiny v3 uses Keycloak; scopes are space-delimited in the authorize request.
 */
export const DEFAULT_SCOPES = ['openid', 'offline_access']
