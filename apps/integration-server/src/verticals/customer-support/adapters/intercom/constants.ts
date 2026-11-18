/**
 * Intercom REST API constants. Every value here is taken from Intercom's own
 * documentation, fetched 2026-09-28:
 *
 * - OAuth guide ("Setting up OAuth"):
 *   https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth
 * - REST API reference, generated from Intercom's OpenAPI description for 2.16
 *   (`servers:` and `intercom_version`):
 *   https://developers.intercom.com/docs/references/introduction
 *   https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 * - Pagination: https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/pagination
 */

/** The three hosting regions the OAuth guide names ("Intercom hosts workspaces in three regions"). */
export type IntercomRegion = 'us' | 'eu' | 'au'

export const REGIONS: readonly IntercomRegion[] = ['us', 'eu', 'au']

/**
 * "Region | Authorization Code endpoint": US `https://app.intercom.com/oauth`,
 * EU `https://app.eu.intercom.com/oauth`, Australia `https://app.au.intercom.com/oauth`.
 */
export const OAUTH_AUTHORIZE_URLS: Record<IntercomRegion, string> = {
  us: 'https://app.intercom.com/oauth',
  eu: 'https://app.eu.intercom.com/oauth',
  au: 'https://app.au.intercom.com/oauth',
}

/**
 * "exchange the code for the Access Token with a POST request to:
 * https://api.intercom.io/auth/eagle/token". The guide names this one token
 * URL for every region; no regional token URL is documented.
 */
export const OAUTH_TOKEN_URL = 'https://api.intercom.io/auth/eagle/token'

/**
 * The OpenAPI `servers:` list: "The production API server"
 * `https://api.intercom.io`, "The european API server"
 * `https://api.eu.intercom.io`, "The australian API server"
 * `https://api.au.intercom.io`.
 */
export const API_BASE_URLS: Record<IntercomRegion, string> = {
  us: 'https://api.intercom.io',
  eu: 'https://api.eu.intercom.io',
  au: 'https://api.au.intercom.io',
}

/**
 * Sent as the `Intercom-Version` header on every request. Without it a request
 * runs at "the version set in the app package" (`intercom_version`
 * description), which the workspace owner can change under us. 2.16 is the
 * version the reference documents and the schema's default.
 */
export const API_VERSION = '2.16'

/**
 * "You can change per_page to whatever you'd like, but the max amount for any
 * API is 150." Search APIs: "the max amount for any API is 150".
 */
export const MAX_PAGE_SIZE = 150
export const DEFAULT_PAGE_SIZE = 50
