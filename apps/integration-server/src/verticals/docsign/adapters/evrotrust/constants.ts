/**
 * Evrotrust Vendor REST API constants.
 *
 * Evrotrust is a Bulgarian eIDAS-qualified trust service provider (QTSP).
 * The vendor REST API drives remote qualified-electronic-signature (QES)
 * flows: a vendor sends a document to one or more identified users who
 * sign it inside the Evrotrust mobile app, then polls status or receives a
 * callback.
 *
 * Docs: https://docs.evrotrust.com/docs/integration
 *
 * Two environments. The base already resolves the `/vendor` prefix, so
 * resource paths nest below it (e.g. `/document/status`). The customer picks
 * the environment on the Connect Link form; it is stored on
 * `credentials.extra.baseUrl`.
 */
export const TEST_BASE_URL = 'https://et.test.iteco.bg/vendor'
export const PROD_BASE_URL = 'https://v.evrotrust.com/vendor'

export const ENVIRONMENT_BASE_URLS: Record<string, string> = {
  test: TEST_BASE_URL,
  production: PROD_BASE_URL,
}

/** Default environment when the form omits one. */
export const DEFAULT_BASE_URL = PROD_BASE_URL

/**
 * Evrotrust document status codes — used by `/document/status`,
 * `/document/group/status` and the e-signature callback payload.
 */
export const STATUS_PENDING = 1
export const STATUS_SIGNED = 2
export const STATUS_REJECTED = 3
export const STATUS_EXPIRED = 4
export const STATUS_FAILED = 5
export const STATUS_WITHDRAWN = 6
export const STATUS_UNDELIVERABLE = 7
export const STATUS_FAILED_FACE_RECOGNITION = 8
export const STATUS_ON_HOLD = 99
