/**
 * SignatureAPI REST API constants.
 *
 * SignatureAPI exposes a single REST host. Test vs. live mode is selected by
 * the API key prefix (`key_test_…` / `key_live_…`) rather than a separate
 * base URL, so there is one base URL for both sandbox and production.
 *
 * Auth is a static API key sent on the `X-API-Key` request header; there is
 * no OAuth flow.
 *
 * Docs: https://signatureapi.com/docs/api/welcome
 */
export const API_VERSION = 'v1'

/** Single REST host; mode (test/live) is keyed off the API-key prefix. */
export const API_BASE_URL = 'https://api.signatureapi.com/v1'

/** Header that carries the static API key. */
export const API_KEY_HEADER = 'X-API-Key'

/**
 * `limit` on the list endpoints: "The maximum number of objects to return in
 * the response, up to 20. The default is 20."
 * (https://signatureapi.com/docs/api/resources/envelopes/list)
 */
export const LIST_MAX_LIMIT = 20

