/**
 * "Hosts: Live: `https://card.peachpayments.com/` Sandbox:
 * `https://sandbox-card.peachpayments.com/`"
 * https://developer.peachpayments.com/docs/oppwa-references-api
 *
 * The adapter has no environment key, so it talks to the live host.
 */
export const API_BASE_URL = 'https://card.peachpayments.com'

/** Caller page size when a list call names no limit. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * "In all requests with pagination, the system ignores the `limit` option and
 * sets the page size to 100 by default."
 * https://developer.peachpayments.com/docs/oppwa-integrations-reporting
 */
export const QUERY_PAGE_SIZE = 100

/**
 * `paymentTypes` filters for GET /v3/query ("Example: `paymentTypes=PA,DB`").
 * A charge is a debit (DB: "Debits the customer's account and credits the
 * merchant account") or a preauthorisation (PA: "Stand-alone authorisation");
 * a refund is RF ("Credits a prior debit or credit").
 * https://developer.peachpayments.com/docs/oppwa-references-api
 */
export const CHARGE_PAYMENT_TYPES = ['DB', 'PA'] as const
export const REFUND_PAYMENT_TYPES = ['RF'] as const
