/**
 * Tap Payments REST API constants.
 *
 * Tap exposes a single REST host. Test vs live mode is selected by the
 * secret-key prefix (`sk_test_…` vs `sk_live_…`) submitted at connect time —
 * there is no separate sandbox domain.
 *
 * Docs: https://developers.tap.company/docs/authentication
 */
export const API_BASE_URL = 'https://api.tap.company/v2'

/** Tap list endpoints default to 25 rows and cap at 50. */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 50
