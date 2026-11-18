/**
 * Comm100 Server API (v4) constants.
 *
 * https://developer.comm100.com/docs/server-api-introduction:
 *   "If your Control Panel domain is dash11.comm100.io , all API requests
 *   (except for the request to generate the access token) should start with
 *   https://api11.comm100.io/v4/ ."
 * and the same sentence for dash12, dash13, dash15 and dash17. No other
 * platform domain is documented.
 */

/** The documented Control Panel domain numbers (dash{n}.comm100.io → api{n}.comm100.io/v4/). */
export const PLATFORM_NUMBERS = ['11', '12', '13', '15', '17'] as const

/** API base for a platform number; replace {n}. */
export const API_BASE_URL_TEMPLATE = 'https://api{n}.comm100.io/v4/'

/**
 * Contacts page-size ceiling. https://developer.comm100.com/docs/server-api-global-setting-contact,
 * GET /contact/contacts: "pageSize ... Page size, default is 50, and the value
 * can not be larger than 500."
 */
export const CONTACTS_MAX_PAGE_SIZE = 500
/** Same source: "default is 50". Sent when the caller names no limit. */
export const CONTACTS_DEFAULT_PAGE_SIZE = 50

/**
 * The adapter's declared page maximum. Contacts is the only list that pages
 * upstream by the caller's page number, and its documented ceiling is 500.
 * Tickets are cut by the row pager and the other lists are whole arrays
 * sliced locally, so neither needs a smaller ceiling.
 */
export const MAX_PAGE_SIZE = CONTACTS_MAX_PAGE_SIZE
