/** "Production Environment" in the spec's `servers`. */
export const CIGO_API_BASE = 'https://app.cigotracker.com/api/v1'
export const CIGO_DASHBOARD_URL = 'https://app.cigotracker.com'
/**
 * POST /jobs/search: "Search for Job API IDs where the date is within a
 * certain start and end range (within 30 days)". A window is 30 calendar days
 * counting both ends.
 */
export const SEARCH_WINDOW_DAYS = 30
