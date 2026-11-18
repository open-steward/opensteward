/**
 * Rocketlane REST API — constants.
 *
 * Production base URL: https://api.rocketlane.com/api/1.0
 * There is no separate sandbox host.
 *
 * Authentication: long-lived API key sent as the `api-key` HTTP header.
 * Keys are generated from the Rocketlane app under
 * Profile → Settings → API → Create API key.
 *
 * Pagination: `pageSize` + `pageToken` cursor (valid for 15 minutes per
 * page). https://developer.rocketlane.com/docs/pagination: "It defaults to
 * 100 if left blank or if the specified pageSize is more than 100."
 *
 * Docs: https://developer.rocketlane.com/reference/introduction
 */
export const API_BASE_URL = 'https://api.rocketlane.com/api/1.0'

/** Where the user generates an API key (shown in the Connect Link help text). */
export const TOKEN_HELP_URL = 'https://developer.rocketlane.com/docs/authentication'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
