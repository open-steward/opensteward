/**
 * https://docs.starkbank.com/api: "BASE URL - Production https://api.starkbank.com"
 * and every endpoint sits under /v2 ("GET /v2/invoice"). The adapter has no
 * environment key, so it talks to production; the documented sandbox host
 * (https://sandbox.api.starkbank.com) is not reachable from a connection.
 */
export const API_BASE_URL = 'https://api.starkbank.com/v2'
export const DEFAULT_PAGE_SIZE = 50
/** Every list's `limit`: "Number of results per cursor. Max = 100." */
export const MAX_PAGE_SIZE = 100
/**
 * Stark Bank amounts are Brazilian reais in cents, the only currency the API
 * documents: "amount INTEGER Transaction amount in cents of reais" and
 * "Amount in cents to be transferred. Example: 100 (R$1.00)."
 */
export const CURRENCY = 'BRL'
