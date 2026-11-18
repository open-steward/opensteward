/**
 * Legalesign REST API (v1) constants.
 *
 * Legalesign is a UK-headquartered e-signature platform with two hosted
 * regions selected by where the account lives:
 *   - US:  https://api.legalesign.com/api/v1
 *   - EU:  https://eu-api.legalesign.com/api/v1
 * Both regions share the same path structure and API version. There is no
 * separate sandbox host — sandbox vs production is toggled per account by
 * support; a sandbox key simply caps you at 5 signers.
 *
 * Auth is a single long-lived API key supplied via the `Authorization`
 * header in the form `ApiKey <username>:<secret>`. The username + secret are
 * shown in the API Dashboard (https://logs.legalesign.com). The Connect Link
 * flow collects the pre-joined `username:secret` string via a custom form
 * (plus an optional region select); the header is assembled in client.ts.
 *
 * Docs: https://apidocs.legalesign.com/  |  OpenAPI:
 * https://github.com/legalesign/Legalesign-V1-OpenAPI3
 */

/** EU hosted API base — eu-api.legalesign.com is the primary endpoint per Legalesign docs. */
export const API_BASE_URL_EU = 'https://eu-api.legalesign.com/api/v1'

/** US hosted API base, for accounts explicitly provisioned in the US region. */
export const API_BASE_URL_US = 'https://api.legalesign.com/api/v1'

/**
 * Default region/base used when none is supplied on credentials.extra.
 * The Legalesign API docs list eu-api.legalesign.com as the canonical root URL
 * (it returns a clean 401 for unauthenticated calls); api.legalesign.com
 * returns 500 in the same case. Default to EU.
 */
export const DEFAULT_API_BASE_URL = API_BASE_URL_EU

/** Resolve the regional base URL from a region string ('us' | 'eu'). */
export function baseUrlForRegion(region: string | undefined): string {
  return String(region ?? '').toLowerCase() === 'us' ? API_BASE_URL_US : API_BASE_URL_EU
}

/** API Dashboard where customers mint/manage their API key. */
export const API_KEY_DASHBOARD_URL = 'https://logs.legalesign.com'

/**
 * Lists paginate with `offset` (0-indexed) + `limit`, returning a Tastypie
 * `{ meta: { limit, offset, total_count, next, previous }, objects: [...] }`
 * wrapper. The default page size is 20.
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
