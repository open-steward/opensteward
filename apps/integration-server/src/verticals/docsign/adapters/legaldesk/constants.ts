/**
 * LegalDesk eSign REST API constants.
 *
 * LegalDesk (legaldesk.com) is an Indian Aadhaar-based eSign / eKYC
 * provider. Its API follows the CCA eSign *transaction* flow: a customer
 * creates a transaction, attaches one-or-more documents and a set of
 * signers, and each signer authorises the signature with an Aadhaar OTP /
 * biometric / iris authentication mode. Status is polled and the completed
 * signed document + an audit trail are delivered to a configured callback.
 *
 * Authentication is a per-account API-key model — an API key issued from
 * the LegalDesk dashboard, sent on every request as the `x-api-key`
 * header. There is no OAuth flow; credentials are collected via the
 * Connect Link form (`credentialFields()` + `exchangeCredentials()`).
 *
 * Production and sandbox are distinct hosts, each issuing its own API key
 * from the dashboard. The resolved host is stored on
 * `credentials.extra.baseUrl` so the client can read it.
 *
 * Docs: https://legaldesk.com/what-are-esign-and-ekyc-api
 */

/** Production host. Resource paths nest under `/${API_VERSION}`. */
export const PRODUCTION_BASE_URL = 'https://api.legaldesk.com'

/** Sandbox host. */
export const SANDBOX_BASE_URL = 'https://api-sandbox.legaldesk.com'

/** Default host when the customer does not pin an environment. */
export const DEFAULT_BASE_URL = PRODUCTION_BASE_URL

/** API version segment prefixed to every resource path. */
export const API_VERSION = 'v1'

/** Header carrying the LegalDesk API key. LegalDesk does NOT use Bearer. */
export const API_KEY_HEADER = 'x-api-key'

export const DEFAULT_PAGE_SIZE = 25
/** The list endpoint caps `limit` at 100. */
export const MAX_PAGE_SIZE = 100
