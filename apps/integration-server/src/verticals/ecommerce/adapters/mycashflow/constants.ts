/**
 * MyCashflow REST API constants.
 *
 * The MyCashflow API is hosted on the store's own subdomain and versioned
 * under /api/v1. Requests must use HTTPS and must NOT have a trailing slash.
 *
 * Auth: HTTP Basic Auth — API users are created in the store admin panel
 * under Account » Extensions » API.
 *
 * Docs: https://support.mycashflow.com/api/
 */

export const API_VERSION = 'v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Build the REST base URL for a given store name.
 *
 * @param storeName  The subdomain part of the store URL (e.g. `myshop` for
 *                   `myshop.mycashflow.fi`). Accepts either the bare
 *                   subdomain or the full hostname.
 */
export function buildBaseUrl(storeName: string): string {
  const host = storeName.includes('.')
    ? storeName.replace(/\/$/, '')
    : `${storeName}.mycashflow.fi`
  return `https://${host}/api/${API_VERSION}`
}
