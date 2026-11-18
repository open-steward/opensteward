/**
 * Help Scout Inbox (Mailbox) API 2.0 constants. Every value here is from the
 * vendor documentation, fetched 2026-09-28.
 */

/**
 * "curl -H "Authorization: Bearer …" https://api.helpscout.net/v2/users/me"
 * https://developer.helpscout.com/mailbox-api/overview/authentication/
 */
export const API_BASE_URL = 'https://api.helpscout.net/v2'

/**
 * Authorization Code flow, step 1: "https://secure.helpscout.net/authentication/authorizeClientApplication?client_id={application_id}&state={your_secret}"
 * https://developer.helpscout.com/mailbox-api/overview/authentication/
 */
export const OAUTH_AUTHORIZE_URL =
  'https://secure.helpscout.net/authentication/authorizeClientApplication'

/**
 * Steps 3 and 4 (code exchange and refresh): "curl -X POST https://api.helpscout.net/v2/oauth2/token"
 * https://developer.helpscout.com/mailbox-api/overview/authentication/
 */
export const OAUTH_TOKEN_URL = 'https://api.helpscout.net/v2/oauth2/token'
