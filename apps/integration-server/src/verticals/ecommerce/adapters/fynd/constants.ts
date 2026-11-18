/**
 * Fynd Platform API constants.
 *
 * Sources (see `auth.ts` and `client.ts` headers for full citations):
 *  - `gofynd/fdk-client-javascript` @ commit `7598488bf04e7a75bc44088441745538d524abec`
 *    (2026-09-10), `sdk/platform/PlatformConfig.js` (default domain),
 *    `sdk/platform/OAuthClient.js` (token/authorize paths),
 *    `sdk/platform/Catalog/CatalogPlatformClient.js` (default page size).
 */

/** Every Platform API request (auth + resource) is served from this host. */
export const FYND_DOMAIN = 'https://api.fynd.com'

/**
 * `CatalogPlatformClient.getProducts` JSDoc: "Number of items to retrieve in
 * each page. Default is 10." No documented upper bound was found in the
 * public SDK reference for any list endpoint used here (Catalog, Order,
 * Cart/Coupon, CompanyProfile, User all declare `pageSize: Joi.number()`
 * with no `.max()`), so `capabilities.maxPageSize` is deliberately left
 * undeclared on the adapter rather than guessed.
 */
export const DEFAULT_PAGE_SIZE = 10

/**
 * Scopes this adapter requests by default when a Connect Link does not
 * override them. Drawn from the scope-string catalog already curated for
 * this platform in `scripts/curated-read-scopes.json` (`ecommerce/fynd`),
 * narrowed to the modules this adapter actually calls: catalog (products),
 * inventory, company locations, orders (read), coupons/price-rules
 * (discounts), and application customers.
 */
export const DEFAULT_SCOPES = [
  'company/products/read',
  'company/products/write',
  'company/inventory/read',
  'company/inventory/write',
  'company/locations/read',
  'company/orders/read',
  'company/price_rules/read',
  'company/price_rules/write',
  'application/customers/read',
]
