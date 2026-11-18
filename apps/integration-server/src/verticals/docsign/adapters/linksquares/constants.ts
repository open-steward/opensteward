/**
 * LinkSquares REST API constants.
 *
 * LinkSquares is a contract-lifecycle-management platform. The docsign
 * vertical maps onto its Finalize product: a Finalize *agreement* is the
 * canonical Envelope, its agreement versions are Documents, and the
 * request-form templates are Templates. The spec documents no signer or
 * activity-log resource, so the adapter refuses those. The Finalize
 * resources are versioned under `/api/finalize/v2`.
 *
 * There is a single hosted API environment at `api.linksquares.com`; there
 * is no separate sandbox host — test vs production is selected by which API
 * key is used and which company the key is scoped to. Every call is
 * REST/HTTPS with JSON request and response bodies.
 *
 * Auth is a single long-lived API key supplied via the `x-api-key` request
 * header (the API gateway wraps it in a short-lived JWT internally; the
 * integrator only ever supplies the raw key). The key is minted from the
 * LinkSquares web app by an Analyze/Finalize Administrator and is collected
 * by the Connect Link flow via the shared `simpleApiKey` template (wired in
 * index.ts); the header is assembled in client.ts. There is no OAuth flow.
 *
 * Docs: https://help.linksquares.com/hc/en-us/articles/10550275687063-LinkSquares-API-and-SDK-Reference-Guide
 */

/** Single hosted API base. Finalize resources nest under /api/finalize/v2. */
export const API_BASE_URL = 'https://api.linksquares.com/api/finalize/v2'

/** Connect-form landing page documenting how to mint + use an API key. */
export const API_KEY_SETTINGS_URL =
  'https://help.linksquares.com/hc/en-us/articles/10575849523735-Managing-API-Keys-and-Authenticating-to-the-LinkSquares-APIs'

/**
 * The agreements and templates lists document `page`, `per_page` and
 * `filter` query parameters. The `status` and `q` params that listEnvelopes
 * still sends are not in the spec (backlog: rebuild envelopes onto `filter`).
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
