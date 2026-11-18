/**
 * Lleida.net Click & Sign REST API constants.
 *
 * Click & Sign is a flat JSON-RPC-style API: every operation is a POST to
 * `${API_BASE_URL}/<action>` (e.g. `cs/v1/get_signature_list`) with the
 * action name echoed in the body's `request` field. There is no per-account
 * host — all tenants share the production endpoint and are scoped by the
 * `user` field + API key.
 *
 * Auth is a static API key sent in the `Authorization: x-api-key <key>`
 * header, paired with the account `user` in every request body. There is no
 * OAuth flow, so credentials are collected through the Connect Link form.
 *
 * Docs:  https://api.lleida.net/dtd/clickandsign/v1/en/
 * Auth:  https://api.lleida.net/dtd/common/v1/en/index.html#authentication
 */

/** Production Click & Sign endpoint. The `cs/v1/` path prefix is per the v1 DTD. */
export const API_BASE_URL = 'https://api.lleida.net/cs/v1'

/**
 * Click & Sign list endpoints are not page-paginated — `get_signature_list`
 * windows by `start_date`/`end_date` (UNIX seconds) with a documented maximum
 * 31-day interval, and returns every matching row in one response.
 */
export const DEFAULT_LOOKBACK_DAYS = 31
export const MAX_LOOKBACK_DAYS = 31
