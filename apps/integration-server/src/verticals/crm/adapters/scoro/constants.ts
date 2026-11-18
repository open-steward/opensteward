export const DEFAULT_PAGE_SIZE = 25

/**
 * https://api.scoro.com/api/v2, "Request Limits": "A maximum of 100 results
 * will be returned for list methods, regardless of the value sent with the
 * per_page parameter." (25 with detailed_response, which this adapter never
 * sends.)
 */
export const MAX_PAGE_SIZE = 100
