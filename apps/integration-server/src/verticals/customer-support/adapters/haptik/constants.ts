/**
 * Haptik API constants.
 *
 * Haptik is a tenant-configured platform: "The base-url will be provided by
 * Haptik at the time of integration."
 *
 * Staging example: https://staging-messenger.haptikapi.com
 * Production example: provided by Haptik SPOC at integration time
 *
 * Auth: every request requires two headers:
 *   Authorization: Bearer <token>
 *   client-id: <client_id>
 */

/** Staging base URL — used when credentials.extra.baseUrl is not set. */
export const STAGING_BASE_URL = 'https://staging-messenger.haptikapi.com'

/** External integration API v2 sub-path. */
export const EXTERNAL_V2_PATH = '/integration/external/v2.0'

/** Bot-as-an-API v1 sub-path. */
export const BOT_API_V1_PATH = '/v1.0'
