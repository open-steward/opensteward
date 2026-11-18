export const TOOKAN_API_BASE = 'https://api.tookanapp.com/v2/'
export const TOOKAN_DASHBOARD_URL = 'https://app.tookanapp.com/'
export const RATE_LIMIT_RPS = 10

/**
 * get_all_tasks "job_type* | number(mandatory) | Filter via Job Type - 0 for
 * Pick Up, 1 for Delivery, 2 for Appointment and 3 for FOS".
 */
export const TOOKAN_JOB_TYPES = [0, 1, 2, 3] as const

/**
 * get_all_tasks "The start and End Date shall have to be inside the 31 days
 * span." A window runs over 31 UTC calendar days, start and end inclusive.
 */
export const TOOKAN_WINDOW_DAYS = 31
