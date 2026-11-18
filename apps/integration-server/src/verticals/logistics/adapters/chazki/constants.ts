/**
 * Chazki — Last-mile courier for Latin America (Peru, Chile, Argentina, Mexico, Colombia).
 *
 * The primary integration API is hosted on Google Cloud Functions.
 * Reference: https://github.com/Chazki-Archive/chazki-api-bucket
 *
 * Authentication: `enterprise-key` request header containing the UUID API key
 * assigned to the enterprise account by Chazki.
 */

/**
 * Base URL for the Chazki Cloud Functions production environment.
 * All resource paths are relative to this origin.
 */
export const CHAZKI_API_BASE = 'https://us-central1-chazki-link.cloudfunctions.net'

/**
 * Path prefix for the custom-integrations REST API (Peru / general endpoint).
 * This is the primary surface supported for order management and tracking.
 */
export const CHAZKI_API_PATH = '/cf-custom-integrations/api/legacy/peru'

/** Full base URL used by ChazkiClient. */
export const CHAZKI_BASE_URL = `${CHAZKI_API_BASE}${CHAZKI_API_PATH}`

/** Header name that carries the enterprise API key on every request. */
export const CHAZKI_AUTH_HEADER = 'enterprise-key'

/** Chazki homepage; API access requires direct contact with Chazki. */
export const CHAZKI_DASHBOARD_URL = 'https://www.chazki.com/'

/** Conservative default — Chazki does not publish an explicit rate-limit. */
export const RATE_LIMIT_RPS = 10

/** Supported country codes (Latin America). */
export const CHAZKI_COUNTRIES = ['PE', 'CL', 'AR', 'MX', 'CO'] as const
