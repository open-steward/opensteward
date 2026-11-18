/**
 * Hyperswitch REST API constants.
 *
 * Hyperswitch is an open-source payments orchestrator. The hosted offering
 * exposes a sandbox and a production host; self-hosters can override the base
 * URL. We default to the hosted sandbox host — operators point at production
 * (or their own deployment) via the connection's base-URL override.
 *
 * Docs: https://api-reference.hyperswitch.io/introduction
 */
export const API_BASE_URL = 'https://sandbox.hyperswitch.io'
export const PRODUCTION_BASE_URL = 'https://api.hyperswitch.io'

/** Page size for cursor/offset-paginated list endpoints. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * POST /payouts/list rejects a limit above 20, below the shared PageSize
 * maximum of 100: "pub const PAYOUTS_LIST_MAX_LIMIT_POST: u32 = 20;"
 * (juspay/hyperswitch crates/common_utils/src/consts.rs), enforced by
 * validate_payout_list_request_for_joins.
 */
export const PAYOUTS_MAX_PAGE_SIZE = 20
