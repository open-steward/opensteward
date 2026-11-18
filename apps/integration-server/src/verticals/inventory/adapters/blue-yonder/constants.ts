/**
 * Blue Yonder (JDA) Luminate WMS API constants.
 *
 * The API is tenant-scoped: every customer gets a dedicated subdomain at
 *   https://<tenant>.blueyonder.com
 *
 * Auth: OAuth 2.0 client-credentials flow.
 * Token endpoint:  https://<tenant>.blueyonder.com/oauth/token
 * API base:        https://<tenant>.blueyonder.com/wms/v1
 *
 * Pagination: page (1-based) + pageSize query params; response envelope
 *   { data: T[], pagination: { page, pageSize, totalPages, totalItems } }
 */

/** Build the OAuth2 token endpoint URL for a given tenant host. */
export function getTokenUrl(tenantHost: string): string {
  return `https://${tenantHost}/oauth/token`
}

/** Build the REST API base URL for a given tenant host. */
export function getApiBaseUrl(tenantHost: string): string {
  return `https://${tenantHost}/wms/v1`
}

export const DEFAULT_PAGE_SIZE = 50

export const SCOPES = ['wms:read']
