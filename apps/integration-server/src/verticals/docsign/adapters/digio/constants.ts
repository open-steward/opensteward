/**
 * Digio REST API constants.
 *
 * Digio is an Indian Aadhaar eSign aggregator (eSign service provider /
 * ASP) plus a paperwork platform. Authentication is HTTP Basic over the
 * `client_id:client_secret` pair issued from the Digio dashboard.
 *
 * Webhooks are signed with HMAC-SHA256 in `X-Digio-Signature` (hex).
 *
 * Docs: https://www.digio.in/developers / https://documentation.digio.in/
 */

/**
 * Backend origin. Digio's "Digio Environments: Sandbox & Production Details"
 * table (documentation.digio.in) lists "Backend Base URL(to be whitelisted in
 * Network)" as `https://ext.digio.in:444` for Sandbox and `https://api.digio.in`
 * for Production. The adapter has always called the sandbox host; that is kept
 * here so every method stays on one environment.
 */
export const API_ORIGIN = 'https://ext.digio.in:444'

/**
 * Path prefix of the calls not yet verified against Digio's docs
 * (document list, cancel, templates). Kept byte-identical to the old base URL.
 */
export const LEGACY_PREFIX = '/v3/client'

/**
 * Documented "Get Document Details":
 * https://documentation.digio.in/swagger/get_getDocumentObject.json
 *   "/v2/client/document/{docId}":{"get":{"summary":"Get Document Details", ...
 */
export const DOCUMENT_DETAILS_PATH = '/v2/client/document'

export const DEFAULT_PAGE_SIZE = 50
