/**
 * FastSpring REST API constants.
 *
 * FastSpring exposes a single REST host for both live and test data — there
 * is no separate sandbox hostname. Whether a record is live or a test
 * transaction is signalled per-record by the `live` boolean and by the API
 * credentials used (a store can be put in test mode). The base URL is
 * therefore the same in every environment.
 *
 * Docs: https://developer.fastspring.com/reference/getting-started-with-your-api
 */
export const API_BASE_URL = 'https://api.fastspring.com'

/** FastSpring paginates list endpoints with `page` + `limit`; default 50. */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50

/** Resource paths. */
export const ACCOUNTS_PATH = '/accounts'
export const ORDERS_PATH = '/orders'
export const SUBSCRIPTIONS_PATH = '/subscriptions'
export const PRODUCTS_PATH = '/products'
