/**
 * StoreFeeder REST API constants.
 *
 * Base URL: https://rest.storefeeder.com
 * Auth: OAuth 2.0 Resource Owner Password Credentials Grant.
 *   POST /Token  (application/x-www-form-urlencoded)
 *   grant_type=password&username={email}&password={password}&client_id={apiKey}
 *   Returns { access_token, token_type, expires_in }.
 *   Subsequent requests: Authorization: Bearer {access_token}
 * Docs: https://rest.storefeeder.com/Help
 */
export const API_BASE_URL = 'https://rest.storefeeder.com'
export const TOKEN_PATH = '/Token'
export const DEFAULT_PAGE_SIZE = 100
/**
 * The largest PageSize the paged endpoints accept. GET products and GET
 * purchase-orders both document PageSize as "This will default to 100. The max
 * page size is 100", "Range: inclusive between 1 and 100"
 * (https://rest.storefeeder.com/Help/Api/GET-products,
 * https://rest.storefeeder.com/Help/Api/GET-purchase-orders), and their
 * PagingInfo sample carries "MaxPageSize": 100.
 */
export const MAX_PAGE_SIZE = 100
