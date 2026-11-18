/**
 * UVdesk API constants.
 *
 * The API base URL is per-tenant: https://{subdomain}.uvdesk.com
 * The subdomain is stored in credentials.extra.subdomain.
 *
 * All endpoints are prefixed with /{locale}/api/ (default locale: en).
 * Responses use .json suffix.
 *
 * Docs: https://www.uvdesk.com/en/api-doc/
 */

/** Default locale prefix used in all API paths. */
export const DEFAULT_LOCALE = 'en'

/** Default number of items per page. UVdesk default is 10; we request more. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Build the base URL for a given subdomain.
 * e.g. subdomain="acme" -> "https://acme.uvdesk.com"
 */
export function buildBaseUrl(subdomain: string): string {
  return `https://${subdomain}.uvdesk.com`
}

/**
 * Build the API path prefix for a given locale.
 * e.g. locale="en" -> "/en/api"
 */
export function apiPrefix(locale = DEFAULT_LOCALE): string {
  return `/${locale}/api`
}
