/**
 * Juro REST API constants.
 *
 * Juro authenticates with a static API key sent in the `x-api-key` header.
 * There is no OAuth flow. Keys are generated in the Juro app under
 * Settings → Integrations → API & webhooks → API.
 *
 * Docs: https://api-docs.juro.com/
 */
export const API_BASE_URL = 'https://api.juro.com'
export const SANDBOX_BASE_URL = 'https://api-sandbox.juro.io'

/** All resource paths live under the v3 namespace. */
export const API_VERSION = 'v3'

/** Juro list endpoints paginate with `skip` + `limit` (max 200). */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
