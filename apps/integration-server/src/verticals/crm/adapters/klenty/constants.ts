/**
 * Klenty API constants.
 *
 * Base URL pattern: https://api.klenty.com/apis/v1/user/{username}
 * The {username} segment is the account email address and is embedded via
 * credentials.extra.username at the client level.
 *
 * Docs: https://support.klenty.com/en/articles/3197537-getting-started-with-klenty-api
 */

export const KLENTY_BASE_URL = 'https://api.klenty.com/apis/v1'

/** Records per page when the caller gives no limit. */
export const DEFAULT_PAGE_SIZE = 100

/**
 * "You can fetch up to 1000 records in a request."
 * (https://support.klenty.com/en/articles/8193357-klenty-s-get-api-s)
 */
export const MAX_PAGE_SIZE = 1000
