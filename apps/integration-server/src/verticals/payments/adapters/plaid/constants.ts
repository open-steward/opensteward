/**
 * Plaid REST API constants.
 *
 * Plaid is a bank-data + bank-payments platform rather than a card acquirer.
 * The payments vertical is served by Plaid's **Transfer** product, whose
 * money-movement objects map onto the canonical Charge / Payout / Refund
 * resources. Every call is a JSON POST; there is no per-resource path
 * versioning — the account is pinned to an API version in the Plaid Dashboard.
 *
 * Plaid runs two environments on distinct hosts (Items cannot move between
 * them), so the connection records which host to call on `credentials.extra`.
 *
 * Docs: https://plaid.com/docs/api/
 */
export const SANDBOX_BASE_URL = 'https://sandbox.plaid.com'
export const PRODUCTION_BASE_URL = 'https://production.plaid.com'

// ── Transfer product endpoints (all POST, JSON body) ────────────────────────
export const TRANSFER_GET_PATH = '/transfer/get'
export const TRANSFER_LIST_PATH = '/transfer/list'
export const TRANSFER_CREATE_PATH = '/transfer/create'
export const TRANSFER_REFUND_GET_PATH = '/transfer/refund/get'
export const TRANSFER_REFUND_CREATE_PATH = '/transfer/refund/create'

// ── Webhook verification key endpoint ───────────────────────────────────────
export const WEBHOOK_VERIFICATION_KEY_PATH = '/webhook_verification_key/get'

/**
 * `/transfer/list` is hard-capped at 25 rows per page (count default + max 25),
 * paged with a numeric `offset`.
 */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 25
