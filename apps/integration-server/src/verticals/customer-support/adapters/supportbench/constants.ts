export const API_BASE_URL = 'https://api.supportbench.com'
export const DEFAULT_PAGE_SIZE = 100
/**
 * The largest caller page. Our cap, not a vendor limit: POST /activities takes
 * no size parameter, and list pages are cut from whole upstream pages.
 */
export const MAX_PAGE_SIZE = 500
