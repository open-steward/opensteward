/** Mixmax REST API v1 base URL. */
export const BASE_URL = 'https://api.mixmax.com/v1'

/** Default page size for paginated list endpoints. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Documented upper limit for `limit`: "Defaults to 50. The upper limit is
 * usually 300, but might be higher for some APIs."
 * https://developer.mixmax.com/reference/getting-started-with-the-api
 */
export const MAX_PAGE_SIZE = 300
