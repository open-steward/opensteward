/**
 * Mekari Sign eSignature REST API constants.
 *
 * Mekari Sign is served through the Mekari API gateway. There are two
 * environments — production (api.mekari.com) and sandbox
 * (sandbox-api.mekari.com) — both under the `/v2/esign/v1` product path.
 *
 * Requests are authenticated with Mekari's HMAC scheme using a Client ID +
 * Client Secret credential pair (modelled here as the adapter's api_key).
 *
 * Docs: https://developers.mekari.com/docs/kb/hmac-authentication
 *       https://mekarisign.com/en/features/esignature-api/
 */

/** Production base URL (host + product path, no trailing slash). */
export const API_BASE_URL = 'https://api.mekari.com/v2/esign/v1'

/** Sandbox base URL. */
export const SANDBOX_API_BASE_URL = 'https://sandbox-api.mekari.com/v2/esign/v1'

/** Mekari HMAC signature algorithm — fixed at hmac-sha256. */
export const HMAC_ALGORITHM = 'hmac-sha256'

/** Headers covered by the HMAC signing string, in order. */
export const HMAC_SIGNED_HEADERS = 'date request-line'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
