/**
 * Kinaxis Maestro (formerly RapidResponse) REST API constants.
 *
 * The API is tenant-hosted: every customer gets a dedicated subdomain at
 * {tenant}.kinaxis.com. The tenant slug is stored in credentials.extra.tenant
 * and used at construction time to build the base URL.
 *
 * OAuth2 endpoints follow the standard Authorization Server pattern at
 * {tenant}.kinaxis.com/oauth/token.
 *
 * Pagination: the API accepts `pageSize` (max 1000) + `page` (1-indexed).
 * Responses include a `totalCount` at the envelope level.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

/** Build the tenant-scoped base URL from the tenant slug. */
export function apiBaseUrl(tenant: string): string {
  return `https://${tenant}.kinaxis.com/api/v1`
}

/** Build the OAuth2 token URL for a given tenant. */
export function tokenUrl(tenant: string): string {
  return `https://${tenant}.kinaxis.com/oauth/token`
}

/** Build the OAuth2 authorization URL for a given tenant. */
export function authUrl(tenant: string): string {
  return `https://${tenant}.kinaxis.com/oauth/authorize`
}

/** Default OAuth2 scopes for read-only inventory access. */
export const DEFAULT_SCOPES = ['openid', 'profile', 'inventory:read']
