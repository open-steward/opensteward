/**
 * Vincere API constants.
 *
 * Vincere uses a tenant-specific REST base URL:
 *   https://{domain}.vincere.io/api/v2/
 *
 * Authentication is OAuth2 via the Vincere Identity service at id.vincere.io.
 * After completing the OAuth2 flow, callers receive an id_token which must be
 * sent as the `id-token` header on every API request. An `x-api-key` (the
 * company API key from Vincere settings) is also required.
 *
 * Docs: https://github.com/vincere-io/vincere-identity
 */

/** Vincere Identity base (production). */
export const VINCERE_IDENTITY_URL = 'https://id.vincere.io'

/** OAuth2 authorize endpoint. */
export const VINCERE_AUTH_URL = `${VINCERE_IDENTITY_URL}/oauth2/authorize`

/** OAuth2 token endpoint (exchange code / refresh token). */
export const VINCERE_TOKEN_URL = `${VINCERE_IDENTITY_URL}/oauth2/token`

/**
 * Tenant-specific REST API base URL template.
 * Replace {domain} with the tenant's subdomain (e.g. "acme" → acme.vincere.io).
 */
export const VINCERE_API_BASE_TEMPLATE = 'https://{domain}.vincere.io/api/v2'

/**
 * Page size of the search endpoints when the caller names none. The spec
 * (https://api.vincere.io/vapi.yaml), on `limit` of every
 * `/<entity>/search/{matrix_vars}`: "Limit on the number of records to
 * return. Default to 25, max limit is 100."
 */
export const VINCERE_DEFAULT_PAGE_SIZE = 25

/** Largest `limit` a search accepts: "Default to 25, max limit is 100." */
export const VINCERE_SEARCH_MAX_LIMIT = 100

/**
 * Largest `start` a search accepts. The spec's Search section: "As of
 * 12.11.0, start param is limited to 10000. If you need deep paging, Vincere
 * search supports cursorMask param."
 */
export const VINCERE_SEARCH_MAX_START = 10_000

/**
 * POST /activities serves fixed slices: "Each call returns a slice of maximum
 * 25 activities." Its `index`: "Index of the slice to get, start at 0 and
 * increase by 1 and index must be less than 400."
 */
export const VINCERE_ACTIVITY_SLICE_LIMIT = 400

/**
 * Default OAuth2 scopes.
 * Vincere Identity uses scope=openid to obtain an id_token in addition to
 * the access_token. Extend with additional resource-level scopes as needed.
 */
export const DEFAULT_VINCERE_SCOPES: readonly string[] = ['openid']
