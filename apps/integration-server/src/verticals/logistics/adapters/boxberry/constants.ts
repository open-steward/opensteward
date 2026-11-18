/**
 * Boxberry API constants.
 *
 * Boxberry exposes a single JSON-RPC-style endpoint.  All requests are GET or
 * POST with a `token` query/body parameter and a `method` parameter that names
 * the operation.
 *
 * Reference: https://github.com/iamwildtuna/boxberry-sdk
 */

/** Primary API base URL (new clients). */
export const BOXBERRY_API_BASE = 'https://api.boxberry.ru/json.php'

/** Fallback base URL used by some legacy integrations. */
export const BOXBERRY_API_BASE_LEGACY = 'https://api.boxberry.de/json.php'

/** Account-level API (some management operations). */
export const BOXBERRY_ACCOUNT_API_BASE = 'https://account.boxberry.ru/json.php'

/** Boxberry dashboard for obtaining API tokens. */
export const BOXBERRY_DASHBOARD_URL = 'https://account.boxberry.ru'

/** Currency used by Boxberry (Russian Rubles). */
export const BOXBERRY_CURRENCY = 'RUB'
