/**
 * Abacus ERP (Switzerland) API constants.
 *
 * Abacus is a tenant-hosted ERP — each customer runs their own server instance.
 * The base URL is therefore dynamic and stored as `credentials.tenantId`
 * (which holds the scheme+host, e.g. "https://mycompany.abacus.ch").
 *
 * OAuth2 endpoints are relative to the tenant base URL:
 *   Authorization:  {baseUrl}/oauth/oauth2/v1/auth
 *   Token:          {baseUrl}/oauth/oauth2/v1/token
 *
 * REST API base:    {baseUrl}/api/entity/v1
 *
 * Docs:
 *   https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/docs/restapi/abacus_rest_api.html
 *   https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/docs/restapi/abacus_authorization_rest_api.html
 */

export const ABACUS_AUTH_PATH = '/oauth/oauth2/v1/auth'
export const ABACUS_TOKEN_PATH = '/oauth/oauth2/v1/token'

/** OData v4 REST entity API path (appended to tenant base URL). */
export const ABACUS_API_PATH = '/api/entity/v1'

/**
 * Default OAuth2 scopes requested when building an auth URL.
 * openid + offline_access = standard OIDC + refresh token.
 * The entity read/write scopes unlock the accounting resources.
 */
export const DEFAULT_SCOPES = [
  'openid',
  'offline_access',
  'abacus.entity.customer.readwrite',
  'abacus.entity.subject.readwrite',
]

// OData pagination defaults
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

// Token validity (Abacus default is 600 s; used when expires_in is absent)
export const DEFAULT_TOKEN_TTL_SECONDS = 600
