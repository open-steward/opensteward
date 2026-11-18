/**
 * ikas GraphQL API constants.
 *
 * ikas uses a GraphQL API (not REST). The v2 endpoint is recommended for
 * new integrations. Authentication uses the OAuth2 client_credentials flow —
 * tokens expire after 14 400 seconds (4 hours) and must be refreshed.
 *
 * Docs: https://ikas.dev/docs/api/getting-started/authentication
 */

/** GraphQL endpoint (v2 recommended for new apps). */
export const GRAPHQL_ENDPOINT = 'https://api.myikas.com/api/v2/admin/graphql'

/**
 * Token endpoint, on the merchant's own store host. The docs' curl example
 * (https://ikas.dev/docs/api/getting-started/authentication):
 *   POST https://<your_store_name>.myikas.com/api/admin/oauth/token
 * The store name is the subdomain of the merchant's ikas admin
 * (`https://<your_store_name>.myikas.com/admin`).
 */
export function tokenEndpoint(storeName: string): string {
  return `https://${normaliseStoreName(storeName)}.myikas.com/api/admin/oauth/token`
}

/**
 * Reduce what the merchant typed to the bare store name: `mystore`,
 * `mystore.myikas.com` and `https://mystore.myikas.com/admin` all become
 * `mystore`. The result is a single DNS label, so it cannot redirect the
 * client secret to any host outside `*.myikas.com`.
 */
export function normaliseStoreName(raw: string | undefined | null): string {
  let v = (raw ?? '').trim().toLowerCase()
  v = v
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.myikas\.com$/, '')
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v)) {
    throw new Error(
      `ikas store name must be the subdomain of your ikas admin (e.g. "mystore" for mystore.myikas.com); got "${raw ?? ''}"`,
    )
  }
  return v
}

/** Access tokens expire after this many seconds (4 hours). */
export const TOKEN_TTL_SECONDS = 14_400

/** Default number of items to request per page. */
export const DEFAULT_PAGE_SIZE = 50

/** Maximum number of items per page accepted by the ikas API. */
export const MAX_PAGE_SIZE = 100

/**
 * Default OAuth scopes for a full-featured install.
 * ikas scope names follow a `read_*` / `write_*` convention.
 */
export const DEFAULT_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'write_orders',
  'read_customers',
  'write_customers',
]
