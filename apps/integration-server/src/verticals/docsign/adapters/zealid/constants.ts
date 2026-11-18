/**
 * ZealiD Data API ("Orpheus") constants.
 *
 * ZealiD is an eIDAS-qualified trust service provider (QTSP) offering
 * remote qualified electronic signatures. It exposes two API surfaces:
 *
 *   - The CSC 2QR API (Cloud Signature Consortium) — remote signature
 *     creation over certificate credentials (`/signatures/signHash`). It
 *     has no document / envelope / signer / template concept, so nothing
 *     in it maps to the canonical docsign schema; it is intentionally not
 *     wired by this adapter.
 *   - The Data API ("Orpheus") — the authenticated user's signed PDF
 *     documents plus identity data. The documents surface is the only
 *     part that maps to the canonical docsign schema, so this adapter
 *     wires Documents and nothing else.
 *
 * Docs: https://developer.zealid.com/docs/data-api-in-detail
 *
 * Auth: an OAuth2 authorization-code grant yields the per-user grant
 * (`access_token` + `customer_id`). Every subsequent Data API request is
 * then signed per-request with an HMAC-SHA512 `Authorization: HMAC ...`
 * header derived from the OAuth client_id/client_secret (see client.ts).
 */

/** Data API base URL — production ("Orpheus" mediator). */
export const API_BASE_URL = 'https://core-hermes.zealid.com/mediator/api/orpheus/v2.0/api'

/** Data API base URL — integration / test environment. */
export const SANDBOX_API_BASE_URL =
  'https://hermes-dev.zealid.com/mediator/api/orpheus/v2.0/api'

/**
 * Auth-link start URL template (production). The user scans the QR code
 * rendered at this URL to grant access. The client_id is a PATH segment —
 * ZealiD does NOT expose an OAuth2 /authorize page.
 *
 * Full URL: <AUTH_LINK_BASE>/<client_id>
 */
export const AUTH_LINK_BASE_URL =
  'https://core-hermes.zealid.com/mediator/web_embed/auth_link/start/hermes_orpheus_dev/hermes_orpheus_dev_provider'

/** Token endpoint path — exchanges `code` for the user `access_token`. */
export const OAUTH_TOKEN_PATH = '/get_token'

/**
 * The Data API returns the full document list in a single response — there
 * is no documented limit / offset / cursor pagination. Kept for parity
 * with the QueryParams contract.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/** ZealiD does not document OAuth scopes for the Data API grant. */
export const DEFAULT_SCOPES: string[] = []
