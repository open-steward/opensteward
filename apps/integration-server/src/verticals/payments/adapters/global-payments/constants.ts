/**
 * Global Payments GP-API constants.
 *
 * Every value here is quoted from the OpenAPI documents embedded in the GP-API
 * reference pages (drupalSettings.api_explorer.yamlContent in the page HTML):
 *
 * - Host: `servers` in https://developer.globalpayments.com/api/transactions
 *   lists "https://apis.globalpay.com/ucp" as "Production Environment" and
 *   "https://apis.sandbox.globalpay.com/ucp" as "Sandbox Environment". The
 *   adapter has no environment key, so only production is used.
 * - Token: `POST /accesstoken` (https://developer.globalpayments.com/api/access-token),
 *   "Using your app credentials, send a request to create a bearer access
 *   token that can be used to execute subsequent API actions."
 * - Version header: `X-GP-Version`, required on every operation, "The version
 *   of the API to execute the request.", default and example "2021-03-22".
 * - Page size: `page_size` on GET /settlement/deposits, "The maximum this
 *   value can be is 1000, meaning that the maximum number of records to
 *   return in a single request is 1000." (maximum: 1000). The same sentence
 *   describes `paging.page_size` in the GET /transactions response.
 */

export const API_BASE_URL = 'https://apis.globalpay.com/ucp'
export const ACCESS_TOKEN_PATH = '/accesstoken'
export const GP_API_VERSION = '2021-03-22'

export const TRANSACTIONS_PATH = '/transactions'
export const DEPOSITS_PATH = '/settlement/deposits'

export const MAX_PAGE_SIZE = 1000
