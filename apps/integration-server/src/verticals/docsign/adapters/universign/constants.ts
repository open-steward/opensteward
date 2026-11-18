/**
 * Universign API v1 constants, from https://apps.universign.com/docs/api/.
 *
 * "Base URLs: https://api.universign.com (PROD) https://api.alpha.universign.com (PREPROD)"
 */
export const API_BASE_URL = 'https://api.universign.com'

/**
 * GET /v1/transactions `size`: "The number of transactions you want to
 * retrieve, starting from the most recent. Maximum is 100, default is 50."
 */
export const TRANSACTIONS_MAX_SIZE = 100
export const TRANSACTIONS_DEFAULT_SIZE = 50

/**
 * GET /v1/templates `size`: "The number of templates you want to retrieve,
 * starting from the most recent. Default is 50." No maximum is documented.
 */
export const TEMPLATES_DEFAULT_SIZE = 50

/**
 * GET /v1/transactions rows carry no documents or instructions, so each row
 * of a page is read back through GET /v1/transactions/{transaction_id}. This
 * bounds how many of those reads are in flight at once (ours, not Universign's).
 */
export const TRANSACTION_READ_CONCURRENCY = 5

export const DEFAULT_SCOPES: string[] = []
