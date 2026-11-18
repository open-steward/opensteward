/**
 * Microsoft Dynamics 365 Supply Chain Management — constants.
 *
 * Two API surfaces:
 *
 * 1. OData REST API (Finance & Operations):
 *    Base: https://{tenantHost}/data/
 *    Entities: ReleasedProductsV2, VendorsV2, PurchaseOrderHeadersV2,
 *              PurchaseOrderLinesV2, TransferOrderHeaders, TransferOrderLines,
 *              InventWarehouseEntity (warehouses / locations)
 *    Auth:     Bearer token from Microsoft Entra (client-credentials grant)
 *    Pagination: $top / $skip; server-driven paging max 10,000
 *
 * 2. Inventory Visibility Add-in REST API:
 *    Base: https://inventoryservice.operations365.dynamics.com
 *    Auth: Two-step — Entra AAD token → IV service token via
 *          https://securityservice.operations365.dynamics.com/token
 *    On-hand query: POST /api/environment/{environmentId}/onhand/indexquery
 */

/** Build the OData API base URL for a customer tenant. */
export function getODataBaseUrl(tenantHost: string): string {
  return `https://${tenantHost}/data`
}

/** Entra OAuth2 token endpoint for a given AAD tenant (directory) ID. */
export function getEntraTokenUrl(aadTenantId: string): string {
  return `https://login.microsoftonline.com/${aadTenantId}/oauth2/v2.0/token`
}

/** Security service token endpoint used to obtain the IV bearer token. */
export const IV_SECURITY_TOKEN_URL =
  'https://securityservice.operations365.dynamics.com/token'

/** Inventory Visibility service base URL. */
export const IV_SERVICE_BASE_URL =
  'https://inventoryservice.operations365.dynamics.com'

/**
 * Scope for the initial Entra (AAD) client-credentials token.
 * 0cdb527f-... is the Inventory Visibility app registration resource ID.
 */
export const ENTRA_SCOPE_FOR_IV = '0cdb527f-a8d1-4bf8-9436-b352c68682b2/.default'

/** Scope declared in the IV security service exchange body. */
export const IV_TOKEN_SCOPE =
  'https://inventoryservice.operations365.dynamics.com/.default'

/** OData page size — max supported by D365 F&O is 10,000; use 1,000 for safety. */
export const DEFAULT_PAGE_SIZE = 1000
