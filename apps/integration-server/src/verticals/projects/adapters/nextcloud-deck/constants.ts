/**
 * Nextcloud Deck API constants.
 *
 * The API is self-hosted: the base URL depends on the user's Nextcloud instance.
 * We use a placeholder that gets overridden per-request via the client, which
 * reads `serverUrl` from credentials. The path suffix is constant.
 */

/** Path appended to the Nextcloud server URL to reach the Deck REST API v1.0 */
export const API_PATH = '/index.php/apps/deck/api/v1.0'

/**
 * OCS base path for comments (Nextcloud Comments API).
 * Appended to the Nextcloud server URL.
 */
export const OCS_API_PATH = '/ocs/v2.php/apps/deck/api/v1.0'

/** Default page size for comment pagination (Deck default is 20; we use 50) */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Largest comments page Deck serves. Undocumented: CommentService::list
 * clamps `limit` to 200 without an error (stable31 and main,
 * https://github.com/nextcloud/deck/blob/main/lib/Service/CommentService.php).
 */
export const DECK_COMMENT_MAX_LIMIT = 200
