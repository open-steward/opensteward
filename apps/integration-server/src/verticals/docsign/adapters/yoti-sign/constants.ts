/**
 * Yoti Sign (eSignatures) REST API constants.
 *
 * Yoti Sign exposes two environments — `api.yotisign.com` (production) and
 * `demo.api.yotisign.com` (sandbox). All resource paths nest under `/v2`.
 * Auth is a static API key sent as `Authorization: Bearer <API_KEY>`; the
 * environment a key belongs to is fixed when the key is issued, so the
 * adapter lets the customer pick which base URL to talk to via a form field
 * (defaulting to production).
 *
 * Docs: https://developers.yoti.com/eSignatures/integration-guide
 */
export const API_VERSION = 'v2'

/** Production REST host. */
export const PRODUCTION_BASE_URL = 'https://api.yotisign.com'

/** Sandbox / demo REST host. */
export const SANDBOX_BASE_URL = 'https://demo.api.yotisign.com'

/** Default host when the customer doesn't pick an environment. */
export const DEFAULT_BASE_URL = PRODUCTION_BASE_URL

/**
 * Resolve the API root (host + version) from the environment stored on
 * `credentials.extra.environment` ('production' | 'sandbox').
 */
export function apiRoot(environment?: unknown): string {
  const host = environment === 'sandbox' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
  return `${host}/${API_VERSION}`
}
