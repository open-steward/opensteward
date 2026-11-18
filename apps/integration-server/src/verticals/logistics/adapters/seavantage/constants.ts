/**
 * SeaVantage Ocean Supply Chain Visibility Platform
 * https://developer.seavantage.com/
 */

/** Base URL for the SeaVantage REST API (v2). */
export const SEAVANTAGE_API_BASE = 'https://api.seavantage.com/api/v2/'

/** Dashboard / developer portal URL — used as the auth redirect target for API-key flows. */
export const SEAVANTAGE_DASHBOARD_URL = 'https://developer.seavantage.com/'

/** Conservative per-second request ceiling for back-off heuristics. */
export const RATE_LIMIT_RPS = 5
