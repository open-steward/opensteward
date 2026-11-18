/**
 * Rebilly API constants, from the first-party OpenAPI definition
 * (https://github.com/Rebilly/api-definitions, openapi/openapi.yaml).
 *
 * `servers`: "https://api-sandbox.rebilly.com/organizations/{organizationId}"
 * (Sandbox server) and "https://api.rebilly.com/organizations/{organizationId}"
 * (Live server).
 */
export const LIVE_ORIGIN = 'https://api.rebilly.com'
export const SANDBOX_ORIGIN = 'https://api-sandbox.rebilly.com'

/**
 * API keys "use the following format: type_environment_tokenizedPayload", e.g.
 * "sk_sandbox_K7W_…" is a "Secret key in the sandbox environment"
 * (https://www.rebilly.com/docs/dev-docs/api-keys).
 */
export const SANDBOX_SECRET_KEY_PREFIX = 'sk_sandbox_'

/** Page size used when a direct caller names no limit. */
export const DEFAULT_PAGE_SIZE = 100

/** collectionLimit.yaml: `limit` "minimum: 0, maximum: 1000". */
export const MAX_LIMIT = 1000

/**
 * invoiceCollectionLimit.yaml (GET /invoices only): "Cap values greater than
 * `100` at `100`." maximum: 100.
 */
export const INVOICE_MAX_LIMIT = 100

/** collectionOffset.yaml: `offset` "minimum: 0, maximum: 1000". */
export const MAX_OFFSET = 1000

/**
 * Transaction.yaml `type` enum values that are money taken from a customer.
 * `filter` values: "Separate multiple values for one field with `,`. The
 * values are joined with OR logic." (https://www.rebilly.com/docs/dev-docs/search-filters)
 */
export const CHARGE_TYPES = ['sale', 'authorize', 'capture'] as const
/** Transaction.yaml `type` enum: `refund`. */
export const REFUND_TYPE = 'refund'
/** PostPayout (paths/payouts.yaml): "Creates a transaction of type `credit`." */
export const PAYOUT_TYPE = 'credit'
