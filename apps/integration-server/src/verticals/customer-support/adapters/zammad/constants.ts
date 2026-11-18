/**
 * Zammad REST API constants.
 *
 * Zammad is self-hosted; the base URL is per-tenant (customer's own FQDN).
 * The REST API root is: https://{fqdn}/api/v1
 *
 * Docs: https://docs.zammad.org/en/latest/api/intro.html
 */

/**
 * URL template — {fqdn} is replaced at request time with the value from
 * credentials.extra.baseUrl (e.g. "https://support.example.com").
 */
export const API_BASE_URL_TEMPLATE = '{baseUrl}/api/v1'

export const DEFAULT_PAGE_SIZE = 100
