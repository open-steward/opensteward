/**
 * ShipEdge REST API constants.
 *
 * Auth: api_key (body param "key") + account_id + warehouse identifier.
 * Inventory v2 endpoints use POST with auth in the request body.
 * Replenishment v3 endpoints use header-based HMAC auth.
 *
 * The subdomain (<integration>) is the tenant-specific integration slug
 * found in ShipEdge account Preferences > API Integration > Web Services Production.
 */

/** Build base URL for the Inventory v2 API given the integration slug. */
export function inventoryBaseUrl(integration: string): string {
  return `https://${integration}.shipedge.com/API/Rest/v2/Inventory`
}

/** Build base URL for the Replenishment v3 API given the integration slug. */
export function replenishmentBaseUrl(integration: string): string {
  return `https://${integration}.shipedge.com/API/Rest/v3/Replenishment`
}

export const DEFAULT_PAGE_SIZE = 100
