/**
 * Userlike (Lime Connect) JSON API constants.
 *
 * Base URL: https://api.userlike.com/api/um/v3/
 * Auth: bare API token in `Authorization` header (no "Bearer" prefix).
 * Docs: https://docs.lime-connect.com/developers/api/json
 */
export const API_BASE_URL = 'https://api.userlike.com/api/um/v3'
export const DEFAULT_PAGE_SIZE = 100
/**
 * Docs (https://docs.lime-connect.com/developers/api/json): "The maximum page
 * size is 100 resource items. If you provide a limit larger than that, we will
 * fallback to this limit." and "The conversation messages endpoint uses cursor
 * based pagination with a maximum page size of 100 messages."
 */
export const MAX_PAGE_SIZE = 100
