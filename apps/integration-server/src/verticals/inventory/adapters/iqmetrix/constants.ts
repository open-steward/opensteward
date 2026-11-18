/**
 * iQmetrix API constants.
 *
 * iQmetrix uses a micro-service architecture where each domain lives under
 * a different hostname. All production endpoints use the "rc" suffix in the
 * hostname (e.g. catalogsrc, availabilityrc, entitymanagerrc, apirc).
 *
 * Auth: OAuth 2.0 resource-owner password grant via accountsrc.iqmetrix.net.
 * Tokens expire after ~12 hours (43199 s); use refresh_token to extend.
 * CompanyId is required for most endpoints and is stored in Credentials.extra.
 */

/** OAuth2 token endpoint (password grant + refresh_token grant). */
export const TOKEN_URL = 'https://accountsrc.iqmetrix.net/v1/oauth2/token'

/** Catalog API — company-scoped product catalog. */
export const CATALOG_BASE_URL = 'https://catalogsrc.iqmetrix.net/v1'

/** Inventory Availability API — per-location quantity on hand. */
export const AVAILABILITY_BASE_URL = 'https://availabilityrc.iqmetrix.net/v1'

/** Entity Manager API — locations / stores / vendor relationships. */
export const ENTITY_BASE_URL = 'https://entitymanagerrc.iqmetrix.net/v1'

/** Inventory Adjustments API — POST /rqinventoryadjustment/Companies/{id}/QuantityAdjustment. */
export const ADJUSTMENTS_BASE_URL = 'https://apirc.iqmetrix.net/rqinventoryadjustment'

/** Purchase Orders API — POST /rqpurchaseorders/Companies/{id}/PurchaseOrders. */
export const PURCHASE_ORDERS_BASE_URL = 'https://apirc.iqmetrix.net/rqpurchaseorders'

/** Default page size for catalog search pagination. */
export const DEFAULT_PAGE_SIZE = 100
