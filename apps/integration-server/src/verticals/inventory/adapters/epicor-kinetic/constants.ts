/**
 * Epicor Kinetic REST API constants.
 *
 * The REST v2 base URL is tenant-specific:
 *   https://{host}/{instance}/api/v2/odata/{company}
 *
 * These values are placeholders resolved at runtime from credentials.extra.
 * The token (IdP / client_credentials) endpoint is fixed:
 *   https://login.epicor.com/connect/token
 */

/** Epicor Identity Provider token endpoint (SaaS). */
export const EPICOR_TOKEN_URL = 'https://login.epicor.com/connect/token'

/**
 * OAuth2 scopes required for server-to-server (client_credentials) access.
 * Both scopes are required: epicor_erp grants ERP data, idp_access grants IdP.
 */
export const EPICOR_SCOPES = 'epicor_erp idp_access'

/** Default OData $top page size (Epicor default cap is 100). */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Build the OData v2 base URL for a given tenant.
 *
 * @param host       The Epicor server hostname, e.g. "acme.epicorcloud.com"
 * @param instance   The ERP instance path segment, e.g. "EpicorERP"
 * @param company    The company code, e.g. "EPIC06"
 */
export function buildBaseUrl(host: string, instance: string, company: string): string {
  return `https://${host}/${instance}/api/v2/odata/${company}`
}
