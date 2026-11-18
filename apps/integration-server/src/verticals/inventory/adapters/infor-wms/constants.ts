/**
 * Infor WMS (CloudSuite) REST API constants.
 *
 * Infor WMS is accessed through the Infor ION API Gateway. Each customer
 * has a unique tenant and base URL derived from their .ionapi credential file.
 * There is no single global base URL — it is constructed at runtime from
 * the credentials the customer supplies:
 *
 *   API base:   {ionApiUrl}/{tenantId}/WMS
 *   Token URL:  typically {portalUrl}/{tokenPath}
 *               (e.g. https://mingle.inforcloudsuite.com/ACME_PRD/as/token)
 *
 * These values correspond to the fields in the .ionapi JSON file Infor issues
 * to each authorised service account: iu, ti, pu, ot, ci, cs, saak, sask.
 */

/**
 * Suffix appended to {ionApiUrl}/{tenantId} to reach the WMS REST root.
 * Example: https://mingle.inforcloudsuite.com/ACME_PRD/WMS
 */
export const WMS_API_PATH = '/WMS'

/**
 * WMS REST API resource paths (relative to the WMS API base).
 * These follow the Infor CloudSuite WMS Warehouse Management Module REST API
 * Guide conventions. The `/{warehouse}/` prefix (facility code) is inserted
 * by the client before each resource path where required.
 */
export const PATHS = {
  items: '/items',
  item: (id: string) => `/items/${encodeURIComponent(id)}`,
  inventoryBalances: '/inventorybalances',
  locations: '/locations',
  location: (id: string) => `/locations/${encodeURIComponent(id)}`,
  suppliers: '/suppliers',
  supplier: (id: string) => `/suppliers/${encodeURIComponent(id)}`,
  purchaseOrders: '/purchaseorders',
  purchaseOrder: (id: string) => `/purchaseorders/${encodeURIComponent(id)}`,
  transferOrders: '/transferorders',
  transferOrder: (id: string) => `/transferorders/${encodeURIComponent(id)}`,
  adjustments: '/adjustments',
  adjustment: (id: string) => `/adjustments/${encodeURIComponent(id)}`,
} as const

/** Default page size — Infor WMS list endpoints typically return up to 200. */
export const DEFAULT_PAGE_SIZE = 100
