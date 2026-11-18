/**
 * Gainsight NXT API constants.
 *
 * Gainsight uses per-resource subdomain base URLs under gainsightcloud.com.
 * Each customer may also have a vanity domain, but the default
 * gainsightcloud.com subdomains work for all standard tenants.
 *
 * Auth:  Accesskey request header (single key per org; does not expire).
 * Docs:  https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs
 */

/** Company (Account) object REST API base URL. */
export const COMPANY_BASE_URL = 'https://companyapi.gainsightcloud.com'

/** Person (Contact) management API base URL. */
export const PERSON_BASE_URL = 'https://personapi.gainsightcloud.com'

/**
 * CTA (Call-To-Action) / Task (Activity) API path prefix.
 * Full URL: https://{tenant}.gainsightcloud.com/v2/cockpit/…
 * The tenant subdomain is stored in credentials.extra.domain.
 */
export const COCKPIT_PATH_PREFIX = '/v2/cockpit'

/** HTTP header that carries the Gainsight access key. */
export const ACCESS_KEY_HEADER = 'Accesskey'

/** Default page size for list operations. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Read API (POST /v1/data/objects/query/{object}) ceiling: "Read API fetches a
 * maximum of 5000 records from one API call."
 * https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Company_and_Relationship_API/Company_API_Documentation
 */
export const READ_API_MAX_PAGE_SIZE = 5000
