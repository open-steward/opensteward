/**
 * SAP S/4HANA Cloud — Inventory Management adapter constants.
 *
 * Base URL pattern: https://<tenant>-api.s4hana.ondemand.com
 * The tenant hostname is supplied at runtime via credentials.extra.tenantUrl.
 *
 * All APIs are OData v2 served under /sap/opu/odata/sap/<SERVICE_NAME>.
 *
 * OAuth 2.0 token endpoint (client-credentials grant):
 *   https://<tenant>-api.s4hana.ondemand.com/sap/bc/sec/oauth2/token
 */

/** Path prefix common to every OData service in this adapter. */
export const ODATA_PATH_PREFIX = '/sap/opu/odata/sap'

/** Product Master (A2X) — OData v2. Entity set: A_Product. */
export const SERVICE_PRODUCT = 'API_PRODUCT_SRV'

/** Material Stock — Read. Entity sets: A_MaterialStock, A_MatlStkInAcctMod. */
export const SERVICE_MATERIAL_STOCK = 'API_MATERIAL_STOCK_SRV'

/** Business Partner — suppliers live under A_Supplier. */
export const SERVICE_BUSINESS_PARTNER = 'API_BUSINESS_PARTNER'

/** Purchase Order — A_PurchaseOrder / A_PurchaseOrderItem. */
export const SERVICE_PURCHASE_ORDER = 'API_PURCHASEORDER_PROCESS_SRV'

/**
 * Default $top (page size) for OData queries.
 * SAP enforces a hard maximum of 1000 for most services; 500 is safe.
 */
export const DEFAULT_PAGE_SIZE = 500

/** SAP OData v2 next-link key in response envelope. */
export const NEXT_LINK_KEY = '__next'
