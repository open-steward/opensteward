/**
 * Spryker Glue REST API constants.
 *
 * Spryker's Glue API is a JSON:API-compliant storefront REST API. Each store
 * instance hosts its own Glue application, typically at a subdomain of the
 * shop domain (e.g. https://glue.mysprykershop.com).
 *
 * Spryker uses cursor/offset pagination via `page[offset]` and `page[limit]`
 * query parameters. Responses are wrapped in a JSON:API envelope:
 *   { data: [...], links: { next, prev, self } }
 */

/** Default number of records per page. */
export const DEFAULT_PAGE_SIZE = 25
/** Maximum page size accepted by Glue. */
export const MAX_PAGE_SIZE = 100

/**
 * Path segment for the Glue access-token endpoint (POST /access-tokens).
 * The full URL is: `{glueBaseUrl}/access-tokens`.
 */
export const TOKEN_PATH = 'access-tokens'

/**
 * Path segment for the refresh-token endpoint (POST /refresh-tokens).
 */
export const REFRESH_TOKEN_PATH = 'refresh-tokens'

/**
 * Default OAuth2 grant type for resource-owner password credentials flow.
 * Spryker also supports `client_credentials` for machine-to-machine via
 * the Backend API; the Storefront API uses `password`.
 */
export const GRANT_TYPE_PASSWORD = 'password'
export const GRANT_TYPE_REFRESH = 'refresh_token'
