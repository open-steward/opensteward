/**
 * eGain API constants.
 *
 * eGain is a multi-tenant SaaS. Each customer has their own host
 * (e.g. acme.egain.cloud). The REST Interaction API lives at:
 *   https://{tenantHost}/system/ws/v12/
 *
 * OAuth2 endpoints are per-tenant and follow the pattern:
 *   https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/{authorize|token}
 *
 * The tenantHost and tenantId are collected via credentialFields and stored in
 * credentials.extra.
 */

/** Base path suffix for the eGain Interaction REST API (appended to tenantHost). */
export const API_BASE_PATH = '/system/ws/v12'

/** Template for the OAuth2 authorization endpoint. {tenantId} replaced at runtime. */
export const OAUTH_AUTHORIZE_URL_TEMPLATE =
  'https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/authorize'

/** Template for the OAuth2 token endpoint. {tenantId} replaced at runtime. */
export const OAUTH_TOKEN_URL_TEMPLATE =
  'https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/token'

/** Default OAuth2 scopes for read-only customer-support integration. */
export const DEFAULT_SCOPES = [
  'core.casemgr.read',
  'core.customermgr.read',
  'core.usermgr.read',
]

/** Default page size for paginated list requests. */
export const DEFAULT_PAGE_SIZE = 50
