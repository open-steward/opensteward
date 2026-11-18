/**
 * X-Cart REST API constants.
 *
 * X-Cart exposes its REST API under the `/api/` prefix on the self-hosted
 * store URL. Auth is a static API key sent via the `X-Auth-Token` header.
 *
 * API docs: https://kb.x-cart.com/en/developer_guide/rest_api/
 */

/** Path prefix for the X-Cart REST API. */
export const API_PREFIX = '/api'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
