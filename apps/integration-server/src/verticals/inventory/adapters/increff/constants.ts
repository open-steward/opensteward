/**
 * Increff Assure OMS/WMS REST API constants.
 *
 * Auth: access-key + secret-key pair sent as custom headers, plus a
 *       client-code that is also embedded in the per-tenant base URL.
 *
 * Base URL pattern: https://{clientCode}.increff.com/api
 *
 * Credentials are provisioned by Increff upon account creation; they are
 * NOT obtainable via OAuth or self-service.
 *
 * Docs: https://docs.increff.com/space/IOSA (Increff Omni Standard APIs)
 */

/** Build the per-tenant base URL from the client code. */
export function buildBaseUrl(clientCode: string): string {
  return `https://${clientCode}.increff.com/api`
}

export const DEFAULT_PAGE_SIZE = 50
