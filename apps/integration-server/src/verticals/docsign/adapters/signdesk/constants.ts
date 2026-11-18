/**
 * SignDesk (Melento) REST API constants.
 *
 * SignDesk — rebranded Melento — is an Indian document-automation platform
 * whose eSign product wraps Aadhaar eSign + DSC signing behind a REST/JSON
 * gateway. Each eSign request groups one-or-more documents and a set of
 * signatories; status is polled in real time and completed documents +
 * audit trails are delivered to a configured callback.
 *
 * Authentication is a per-license API-key model — an Application ID
 * (entity/tenant identifier) plus a License Key (secret), sent as request
 * headers. There is no OAuth flow; credentials are collected via the
 * Connect Link form (`credentialFields()` + `exchangeCredentials()`).
 *
 * Production and sandbox are distinct environments, each issuing its own
 * Application ID + License Key from the dashboard.
 *
 * Host: the confirmed live API host is api.signdesk.in (India TLD); resource
 * paths nest under /api/... (no version segment in the base path). The
 * sandbox environment uses the same host with a different credential set —
 * SignDesk does not expose a separate public sandbox subdomain.
 *
 * Docs: https://docs.melento.ai/ (login-gated) — https://signdesk.com/esign-api
 */

/**
 * Production (and sandbox) API host. The confirmed live endpoint is
 * api.signdesk.in (India TLD). Resource paths nest under `/api/...`.
 *
 * NOTE: SignDesk does not publish a separate sandbox hostname — both
 * production and sandbox credentials hit the same host.  If SignDesk ever
 * provides a distinct sandbox host, override via `credentials.extra.baseUrl`.
 */
export const PRODUCTION_BASE_URL = 'https://api.signdesk.in'

/**
 * Sandbox base URL. SignDesk does not publicly document a dedicated sandbox
 * host; set to the same confirmed host as production.  Customers who receive
 * a sandbox-specific URL can pass it via `credentials.extra.baseUrl`.
 */
export const SANDBOX_BASE_URL = 'https://api.signdesk.in'

/** Default host when the customer does not pin an environment. */
export const DEFAULT_BASE_URL = PRODUCTION_BASE_URL

/**
 * Path prefix for all API resources. Confirmed from the live endpoint pattern
 * `api.signdesk.in/api/...`. No version segment is included here — version
 * is not part of the confirmed public path scheme.
 */
export const API_PATH_PREFIX = '/api'

/** Header carrying the Application ID (entity/tenant identifier). */
export const APP_ID_HEADER = 'x-application-id'

/** Header carrying the License Key (secret). SignDesk does NOT use Bearer. */
export const LICENSE_KEY_HEADER = 'x-license-key'

export const DEFAULT_PAGE_SIZE = 25
/** The list endpoint caps `limit` at 100. */
export const MAX_PAGE_SIZE = 100
