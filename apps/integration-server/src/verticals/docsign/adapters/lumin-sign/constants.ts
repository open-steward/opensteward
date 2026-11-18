/**
 * Lumin Sign REST API constants.
 *
 * Lumin Sign authenticates with a static API key sent in the `X-API-Key`
 * request header on every call — there is no OAuth authorization-code flow
 * for the api-key model. The customer generates the key in Lumin under
 * Settings → Developer settings → API keys.
 *
 * The same primary key doubles as the webhook signing secret: webhook
 * deliveries carry an `X-Signature` header that is the HMAC-SHA256 hex
 * digest of the raw request body keyed by the primary API key.
 *
 * Docs: https://developers.luminpdf.com/home
 */

/** Production REST base. */
export const API_BASE_URL = 'https://api.luminpdf.com/v1'

/** Sandbox REST base. Selected when `credentials.extra.environment === 'sandbox'`. */
export const SANDBOX_API_BASE_URL = 'https://api-sandbox.luminpdf.com/v1'

/**
 * Template list page size. The `limit` query param on GET /templates only
 * accepts one of 10, 25, or 50; we default to the largest.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50

/** Allowed `limit` values for GET /templates. */
export const ALLOWED_PAGE_SIZES = [10, 25, 50] as const

/**
 * API-version header required by the templates endpoints; the docs pin
 * GET /templates to `X-Lumin-API-Version: 1.1`.
 */
export const API_VERSION_HEADER = 'X-Lumin-API-Version'
export const API_VERSION = '1.1'

/**
 * Lumin Sign is api-key auth; scopes are not meaningful. The constant is
 * kept so the adapter file layout matches the reference adapters one-for-one.
 */
export const DEFAULT_SCOPES: string[] = []
