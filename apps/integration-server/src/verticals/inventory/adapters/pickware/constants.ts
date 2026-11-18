/**
 * Pickware (Shopware ERP powered by Pickware) REST API constants.
 *
 * Pickware is a Shopware 5 plugin; the REST API lives on the merchant's own
 * Shopware 5 instance.  The base URL is therefore customer-supplied.
 *
 * Auth: HTTP Basic Authentication — base64(username:api_key).
 * Pagination: `start` (offset) + `limit` query parameters.
 * Envelope: { success: boolean, total?: number, data: T | T[] }
 */
export const DEFAULT_PAGE_SIZE = 100
