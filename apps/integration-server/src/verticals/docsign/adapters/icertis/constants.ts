/**
 * Icertis Contract Intelligence (ICI) REST API constants.
 *
 * ICI is multi-tenant: every customer has its own API gateway host of the
 * shape `https://api-<region><N>.icertis.com`. Non-production (sandbox)
 * gateways carry a `-nonprod` suffix. The per-tenant host is resolved at
 * runtime from `credentials.extra.instanceUrl`; the constant below is only
 * a sandbox default used when no instance URL has been stored yet.
 *
 * Auth is Microsoft Entra ID (Azure AD) OAuth2 authorization-code. The
 * authorize/token endpoints are tenant-scoped and resolved from the
 * customer's Directory (tenant) ID. ICI validates the JWT audience against
 * `api://<clientId>`, so the requested scope is `api://<clientId>/.default`.
 *
 * Docs: https://centralindia-nonprod-apim.developer.azure-api.net/get-started
 */

/** Default sandbox gateway; the real per-tenant host comes from credentials.extra.instanceUrl. */
export const DEFAULT_INSTANCE_URL = 'https://api-in1-nonprod.icertis.com'

/** ICI REST API path prefix on the gateway host. */
export const API_PATH_PREFIX = '/api/v1'

/** Microsoft Entra ID (Azure AD) OAuth2 endpoints. `{tenant}` is the
 *  customer's Directory (tenant) ID and is substituted at runtime. */
export const OAUTH_AUTHORIZE_URL_TEMPLATE =
  'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize'
export const OAUTH_TOKEN_URL_TEMPLATE =
  'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'

/** Tenant placeholder used when no Directory (tenant) ID has been configured. */
export const DEFAULT_TENANT = 'common'

/** ICI paginates to 10 by default; pageSize is capped at 100. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Default scope for the Entra ID authorization-code flow. `api://<clientId>/.default`
 * is appended at request time (it needs the client id); `offline_access` is
 * requested here so the token response carries a refresh token.
 */
export const DEFAULT_SCOPES = ['openid', 'offline_access']

/** Header carrying the ICI subscription / product key (per-tenant). */
export const PRODUCT_KEY_HEADER = 'ici-product-key'
