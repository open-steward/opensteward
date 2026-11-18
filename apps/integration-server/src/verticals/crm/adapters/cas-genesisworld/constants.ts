/**
 * CAS genesisWorld REST API constants.
 *
 * The base URL is per-deployment (on-premise or hosted):
 *   https://{your-instance}/genesisrest.svc
 *
 * The API version is included in every path.
 * Docs: https://demo.cas.de/genesisrest.svc/v7.0/help/
 */

/** API version segment prepended to every path. */
export const API_VERSION = 'v7.0'

/**
 * Default instance URL used when none is supplied in credentials.extra.
 * In practice every deployment has its own URL; this is a fallback only.
 */
export const DEFAULT_BASE_URL = 'https://demo.cas.de/genesisrest.svc'

/** Default page size for paginated list operations. */
export const DEFAULT_PAGE_SIZE = 25

/** Filter expressions for the smartsearch / address list endpoints. */
export const FILTER_CONTACT = "GWISCONTACT='true'"
export const FILTER_COMPANY = "GWISCOMPANY='true'"
