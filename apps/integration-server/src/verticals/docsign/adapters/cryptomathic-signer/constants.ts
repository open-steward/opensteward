/**
 * Cryptomathic Signer — Cloud Signature Consortium (CSC) API v2 constants.
 *
 * Cryptomathic Signer is an eIDAS-certified Remote Signature Service Provider
 * (RSSP). As an Executive Member of the Cloud Signature Consortium, Signer
 * exposes its remote-signing surface through the standardised CSC API v2
 * (`/csc/v2/...`) rather than a bespoke REST API.
 *
 * The CSC base URI is per-deployment (each TSP/QTSP hosts its own RSSP), so
 * the REST base URL and the OAuth 2.0 token endpoint are collected on the
 * Connect-Link credential form and persisted on `credentials.extra`.
 *
 * Auth: OAuth 2.0 client-credentials grant (`authType: "oauth2client"`). The
 * issued bearer token is sent to the CSC endpoints as
 * `Authorization: Bearer <token>` (RFC 6750).
 *
 * Docs:
 *   Cryptomathic developer portal: https://www.cryptomathic.com/developer-portal
 *   CSC API v2 specification:      https://cloudsignatureconsortium.org/resources/
 */

/** CSC API version segment. The base URI SHALL end with `/csc/v2`. */
export const CSC_API_VERSION = 'v2'

/** Path prefix appended to the customer-supplied base URL. */
export const CSC_API_BASE_PATH = `/csc/${CSC_API_VERSION}`

/**
 * Demonstration / evaluation RSSP base URL. Cryptomathic Signer is deployed
 * per-TSP, so this is only a sensible default for evaluation; the customer
 * supplies their own RSSP base URL on the credential form.
 */
export const DEFAULT_BASE_URL = 'https://signer.cryptomathic.com'

/** CSC specification version this adapter targets (`specs` value from `info`). */
export const TARGET_SPECS = '2.0.0.0'

/**
 * Default OAuth 2.0 scope for the client-credentials (service) grant. The
 * `service` scope authorises access to the CSC API methods.
 */
export const DEFAULT_SCOPES = ['service']

/*
 * No page-size constants: CSC API v2 `credentials/list` has no paging
 * parameter and returns every credential in one reply (section 11.4). The
 * `maxResults` / `pageToken` / `nextPageToken` trio was CSC v1.
 */
