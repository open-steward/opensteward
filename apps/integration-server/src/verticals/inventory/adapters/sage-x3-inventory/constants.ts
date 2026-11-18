/**
 * Sage X3 REST API constants.
 *
 * The base URL for Sage X3 on-premise installations follows the pattern:
 *   http(s)://<server>:<port>/api1/x3/erp/<FOLDER>
 *
 * where FOLDER is the X3 database/endpoint name (e.g. SEED, LIVE).
 * Because this is customer-specific, we do not hard-code a server hostname —
 * the customer provides their server URL in credential fields and it is stored
 * in credentials.extra.serverUrl and credentials.extra.folder.
 *
 * For Sage X3 Online (SaaS), the base URL is typically:
 *   https://<tenant>.online.sage.com/api1/x3/erp/<FOLDER>
 *
 * OAuth2 endpoints are also tenant-relative; the authorization server URL is
 * stored in credentials.extra.authServerUrl (e.g. https://<tenant>.online.sage.com).
 */

/** Default page size for $query requests */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Sage X3 REST representation names (api1 protocol).
 * Each maps to a class in the X3 data dictionary.
 */
export const REPR = {
  /** Product master — ITMMASTER */
  PRODUCT: 'ITMMASTER',
  /** Stock levels by product + site — STKCNSSDIM */
  STOCK_LEVEL: 'STKCNSSDIM',
  /** Storage locations (bins/warehouses) — STOLOC */
  LOCATION: 'STOLOC',
  /** Supplier (business partner) — BPSUPPLIER */
  SUPPLIER: 'BPSUPPLIER',
  /** Purchase order header — PORDER */
  PURCHASE_ORDER: 'PORDER',
  /** Miscellaneous receipts / inter-site transfers — MISREC */
  STOCK_TRANSFER: 'MISREC',
  /** Stock count / inventory adjustment — INVADJ */
  STOCK_ADJUSTMENT: 'INVADJ',
} as const

/**
 * Facet suffixes used in `representation` query param.
 *   $query   — paginated list
 *   $details — single record
 */
export const FACET = {
  QUERY: '$query',
  DETAILS: '$details',
} as const
