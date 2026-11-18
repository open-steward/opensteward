/**
 * Validated ID — VIDsigner REST API constants.
 *
 * VIDsigner is the e-signature product of Validated ID (Barcelona),
 * an EU eIDAS trust-service provider. The REST API is versioned in the
 * path (`/api/v2.2`) and authenticated with HTTP Basic using a
 * per-subscription user + password.
 *
 * Docs: https://help.vidsigner.net (VIDsigner API 2.2 Rest Services
 * Specifications). Environments:
 *   - production:  https://vidsignercloud.validatedid.com/api
 *   - pre-prod:    https://pre-vidsignercloud.validatedid.com/api
 *
 * The customer types the environment + subscription credentials into the
 * Connect Link form; the adapter stores the chosen base URL on
 * `credentials.extra.baseUrl`.
 */
export const API_VERSION = 'v2.2'

export const PRODUCTION_BASE_URL = 'https://vidsignercloud.validatedid.com/api'
export const SANDBOX_BASE_URL = 'https://pre-vidsignercloud.validatedid.com/api'

/** Default when `credentials.extra.baseUrl` is absent. */
export const DEFAULT_BASE_URL = PRODUCTION_BASE_URL

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
