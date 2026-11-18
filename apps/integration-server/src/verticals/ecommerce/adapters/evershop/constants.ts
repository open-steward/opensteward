/**
 * EverShop REST API constants.
 *
 * EverShop is a self-hosted Node.js + GraphQL ecommerce platform. Its REST
 * API lives at `{baseUrl}/api` with no versioning segment — the path is
 * determined by the host deployment. Credentials are short-lived JWTs
 * obtained from `POST /api/user/tokens`.
 *
 * NOTE: EverShop does not have a refresh-token endpoint. Re-authenticate with
 * email + password when the JWT expires.
 *
 * Docs: https://evershop.io/docs/api/overview
 */

/** Default page size for paginated list requests. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size accepted by EverShop. */
export const MAX_PAGE_SIZE = 200

/** Path to obtain an admin JWT (relative to baseUrl). */
export const TOKEN_PATH = '/api/user/tokens'
