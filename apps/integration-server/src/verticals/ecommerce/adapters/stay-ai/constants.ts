/**
 * Stay AI (Retextion) API constants.
 *
 * Stay AI is a Shopify-native subscription retention platform. Its REST API
 * is hosted at api.retextion.com under the v2 namespace.
 *
 * API keys are generated in the merchant portal under Settings → API Keys.
 * Docs: https://docs.stay.ai/reference/authentication
 */

/** Production REST base URL — Stay AI has no separate sandbox endpoint. */
export const BASE_URL = 'https://api.retextion.com/api/v2'

/** Default number of records per page (Stay AI range: 5–100). */
export const DEFAULT_PAGE_SIZE = 50

/** Maximum page size accepted by the Stay AI API. */
export const MAX_PAGE_SIZE = 100
