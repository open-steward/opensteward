/**
 * BoldSign REST API constants.
 *
 * BoldSign authenticates server-to-server requests with a static API key
 * sent in the `X-API-KEY` header — backend integrations do not use an OAuth
 * Authorization-Code flow, so the adapter collects the key through the
 * Connect Link credential form.
 *
 * The default host serves the US region; EU-hosted accounts use a separate
 * regional host. The customer selects the region on the credential form and
 * the chosen base URL is stored on `credentials.extra.baseUrl`.
 *
 * Docs: https://developers.boldsign.com/
 * Auth: https://developers.boldsign.com/authentication/api-key/
 */
export const API_BASE_URL = 'https://api.boldsign.com'

/** Region slug → API host. The credential form offers these as a closed set. */
export const REGION_BASE_URLS: Record<string, string> = {
  us: 'https://api.boldsign.com',
  eu: 'https://api-eu.boldsign.com',
}

/** BoldSign list endpoints default to 10 rows; the documented max is 100. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
