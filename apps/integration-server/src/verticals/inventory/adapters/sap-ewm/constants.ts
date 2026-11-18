/**
 * SAP Extended Warehouse Management (SAP EWM) — adapter constants.
 *
 * SAP EWM is an on-premise / private-cloud OData service embedded in
 * SAP S/4HANA.  The base URL is tenant-specific; consumers supply it
 * via credential fields at configuration time.
 *
 * OData paths follow the SAP Gateway convention:
 *   https://<host>:<port>/sap/opu/odata/sap/<SERVICE_NAME>/
 *
 * OAuth 2.0 (client-credentials) token endpoint:
 *   https://<host>:<port>/sap/bc/sec/oauth2/token
 */

/** OData v2 service paths (relative to the tenant base URL). */
export const SERVICES = {
  /** Warehouse Available Stock – Read (A2X)  */
  AVAILABLE_STOCK: '/sap/opu/odata/sap/WAREHOUSEAVAILABLESTOCK_0001',

  /** Warehouse Inbound Delivery – Read, Update (A2X) */
  INBOUND_DELIVERY: '/sap/opu/odata/sap/WAREHOUSEINBOUNDDELIVERY_0001',

  /** Warehouse Outbound Delivery Order – Read (A2X) */
  OUTBOUND_DELIVERY: '/sap/opu/odata/sap/API_WHSE_OUTB_DLV_ORDER',

  /** Physical Inventory – Read, Update (A2X) */
  PHYSICAL_INVENTORY: '/sap/opu/odata/sap/API_WHSE_PHYSINVTRYITEM_2',

  /** Warehouse Order and Task – Read (A2X) */
  WAREHOUSE_ORDER: '/sap/opu/odata/sap/API_WAREHOUSE_ORDER_TASK_2',

  /** Product Master – Read (A2X) */
  PRODUCT_MASTER: '/sap/opu/odata/sap/API_PRODUCT_SRV',

  /**
   * Business Partner – Read (A2X).
   * Used for supplier name and contact data via A_Supplier + $expand=to_BusinessPartner.
   * NOTE: to_SupplierCompany only holds per-company-code financials, not the name.
   */
  BUSINESS_PARTNER: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
} as const

/** OAuth2 path segment appended to the tenant base URL. */
export const OAUTH_TOKEN_PATH = '/sap/bc/sec/oauth2/token'

/** OData top / skip pagination cap (SAP default max = 1 000). */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1_000

/** SAP OData v2 JSON format query param. */
export const ODATA_FORMAT = '$format=json'
