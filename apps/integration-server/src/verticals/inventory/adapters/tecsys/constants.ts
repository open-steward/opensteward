/**
 * Tecsys OrderDynamics OMS API constants.
 *
 * The production API is hosted on Azure API Management at api.orderdynamics.net.
 * All paths are prefixed with /v1/.
 *
 * OAuth2: Azure AD client_credentials grant. The tenant_id, client_id, and
 * client_secret are obtained from the Azure App Registration created for the
 * integration. The token endpoint is the standard Azure AD v2 endpoint.
 *
 * Pagination: every list endpoint accepts pageSize (max 100) and pageNumber
 * (1-indexed). Responses are plain JSON arrays — no envelope totalCount field
 * is documented, so callers must stop when the response array length is shorter
 * than the requested pageSize.
 *
 * Rate limits: not publicly documented; we apply the standard back-off on 429.
 */

export const API_BASE_URL = 'https://api.orderdynamics.net'
export const API_VERSION = 'v1'

/** Azure AD v2 token endpoint template — substitute {tenantId}. */
export const TOKEN_URL_TEMPLATE =
  'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token'

/** Default OAuth2 scope for the OrderDynamics resource (/.default = all app roles). */
export const DEFAULT_SCOPE = 'https://api.orderdynamics.net/.default'

export const DEFAULT_PAGE_SIZE = 100
