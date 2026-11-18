/**
 * OneSpan Sign (formerly eSignLive) REST API constants.
 *
 * OneSpan operates two hosts: a sandbox at sandbox.esignlive.com and a
 * production host at apps.esignlive.com. The adapter defaults to the
 * sandbox; flip `API_BASE_URL` (or pass via `credentials.extra.baseUrl`)
 * for production.
 *
 * Auth is `Authorization: Basic <apiKey>` per the OneSpan convention —
 * the API key IS the bearer credential, no client_id/client_secret.
 *
 * Docs: https://community.onespan.com/documentation/onespan-sign/guides/feature-guides/developer/rest-api-guide
 */
export const SANDBOX_BASE_URL = 'https://sandbox.esignlive.com/api'
export const PROD_BASE_URL = 'https://apps.esignlive.com/api'

/** Default to sandbox. Pass `credentials.extra.baseUrl = PROD_BASE_URL` to switch. */
export const API_BASE_URL = SANDBOX_BASE_URL

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
