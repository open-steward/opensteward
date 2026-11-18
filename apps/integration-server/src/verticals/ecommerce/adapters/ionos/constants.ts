/**
 * IONOS ecommerce API constants.
 *
 * IONOS is a European hosting and website-builder platform (formerly 1&1).
 * Its ecommerce offering is powered by the IONOS Online Store, which provides
 * a REST API for managing products and orders.
 *
 * Auth: API key via `Authorization: Bearer <key>` header.
 * Base URL: https://api.ionos.com/ecommerce/v1
 *
 * IONOS has a limited ecommerce API — only products and orders are exposed.
 *
 * Docs: https://developer.hosting.ionos.com/
 */

export const BASE_URL = 'https://api.ionos.com/ecommerce/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
