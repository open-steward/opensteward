/**
 * Bold Commerce API constants.
 *
 * Docs: https://developer.boldcommerce.com/guides/checkout/public-integrations
 */

/** "Each Bold API request accesses https://api.boldcommerce.com." */
export const API_BASE_URL = 'https://api.boldcommerce.com'

/**
 * Sent as `Bold-API-Version-Date`. "If you do not send the version header with
 * your API request, or send a value that is not valid, Bold uses the fallback
 * version. The fallback version is currently 2022-05-01." Pinning it keeps the
 * adapter on the version its response shapes were written against.
 * https://developer.boldcommerce.com/guides/checkout/resources/api-versioning
 */
export const API_VERSION_DATE = '2022-05-01'

/** OAuth install page and token endpoint (Shops API `OAuthToken` scheme). */
export const AUTHORIZE_URL = 'https://apps.boldapps.net/accounts/dashboard/authorize'
export const TOKEN_URL = 'https://api.boldcommerce.com/auth/oauth2/token'

/**
 * "`limit` — Limits the number of results per-page. Maximum 100."
 * https://developer.boldcommerce.com/guides/checkout/resources/query-pagination
 * (the Price Rules Query & Pagination guide states the same maximum).
 */
export const MAX_PAGE_SIZE = 100

/**
 * Read scopes for the resources this adapter lists, from the Access Scopes
 * table (https://developer.boldcommerce.com/guides/checkout/resources/access-scopes):
 * `read_products` (View products), `read_customers` (View customers),
 * `read_price_rulesets` (View price rulesets) and `read_shop` (View shop
 * information, for Get Shop Info at connect time).
 */
export const DEFAULT_SCOPES = [
  'read_products',
  'read_customers',
  'read_price_rulesets',
  'read_shop',
]
