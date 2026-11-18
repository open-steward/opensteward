/**
 * Carerix REST API constants.
 *
 * Carerix is a recruitment / staffing CRM. It exposes:
 *   - A REST API at https://api.carerix.com
 *   - An OAuth2/OIDC identity service at https://id.carerix.io
 *
 * Token endpoints are per-tenant:
 *   https://id.carerix.io/auth/realms/{tenantSlug}/protocol/openid-connect/token
 * The tenantSlug (called "system name" in Carerix docs) is supplied by the
 * operator when installing the integration. For the authorization-code flow
 * the OIDC discovery URL is:
 *   https://id.carerix.io/auth/realms/{tenantSlug}/.well-known/openid-configuration
 *
 * Docs: https://help.carerix.com/en/articles/9464648-carerix-rest-api
 *       https://help.carerix.com/en/articles/9482350-graphql-api
 */

export const CARERIX_BASE_URL = 'https://api.carerix.com'

/**
 * Default Keycloak identity server. Carerix runs several (`id`, `id-2`,
 * `id-3`, …); a customer's is the host in their OpenID Configuration.
 */
export const CARERIX_DEFAULT_IDENTITY_SERVER = 'id.carerix.io'

/** Keycloak-hosted OIDC base on the default identity server; append /{tenantSlug}/protocol/openid-connect/… */
export const CARERIX_OIDC_BASE = `https://${CARERIX_DEFAULT_IDENTITY_SERVER}/auth/realms`

/** Build the authorization-code endpoint for a tenant's realm on its identity server. */
export function carerixAuthUrl(
  tenantSlug: string,
  identityServer: string = CARERIX_DEFAULT_IDENTITY_SERVER,
): string {
  return `https://${identityServer}/auth/realms/${encodeURIComponent(tenantSlug)}/protocol/openid-connect/auth`
}

/** Build the token endpoint for a tenant's realm on its identity server. */
export function carerixTokenUrl(
  tenantSlug: string,
  identityServer: string = CARERIX_DEFAULT_IDENTITY_SERVER,
): string {
  return `https://${identityServer}/auth/realms/${encodeURIComponent(tenantSlug)}/protocol/openid-connect/token`
}

/**
 * Default OAuth2 scopes for the REST API.
 * `urn:cx/xmlapi:data:manage` grants read/write access to the REST API objects.
 */
export const DEFAULT_CARERIX_SCOPES: readonly string[] = [
  'urn:cx/xmlapi:data:manage',
]

/** Default page size for list requests. */
export const CARERIX_DEFAULT_PAGE_SIZE = 25
