/**
 * Businessmap API v2 constants.
 *
 * Base URL uses a per-account subdomain:
 *   https://{subdomain}.kanbanize.com/api/v2
 *
 * The subdomain is passed in at credential-exchange time and stored in
 * credentials.extra['subdomain'] so the client can construct the full URL.
 */

export const KANBANIZE_HOST_SUFFIX = '.kanbanize.com'
export const API_BASE_PATH = '/api/v2'

/** Build the per-account base URL from a subdomain. */
export function buildBaseUrl(subdomain: string): string {
  return `https://${subdomain}${KANBANIZE_HOST_SUFFIX}${API_BASE_PATH}`
}

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200
