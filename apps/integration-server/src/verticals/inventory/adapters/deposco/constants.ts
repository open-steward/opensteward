/**
 * Deposco WMS REST API constants.
 *
 * Auth: HTTP Basic Auth (username:password).
 * Base URL pattern: https://{instance}.deposco.com/integration/{tenantCode}
 *
 * The instance host and tenant code are provided by the customer's Deposco
 * account manager; both are validated in auth.ts before they reach here.
 */

/** Build the per-tenant base URL from a normalised instance subdomain and tenant code. */
export function buildBaseUrl(instance: string, tenantCode: string): string {
  return `https://${instance}.deposco.com/integration/${encodeURIComponent(tenantCode)}`
}

export const DEFAULT_PAGE_SIZE = 100
export const DEFAULT_BUSINESS_UNIT = 'DEFAULT'
