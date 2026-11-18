/**
 * Omnidesk REST API constants.
 * Per-tenant subdomain — baseURL is templated at request time via
 * credentials.extra.subdomain.
 *
 * Docs: https://omnidesk.ru/api/cases
 */
export const API_BASE_URL_TEMPLATE = 'https://{subdomain}.omnidesk.ru/api'
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
