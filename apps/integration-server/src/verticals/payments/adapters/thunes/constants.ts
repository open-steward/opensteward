/**
 * Thunes Money Transfer API v2 (https://docs.thunes.com/money-transfer/v2/).
 *
 * There is no public host: "Specific details relating to the endpoints will be
 * provided upon account creation." The connection supplies it (see auth.ts).
 */

/** "GET /v2/money-transfer/balances — Retrieve information for all account balances per currency." */
export const BALANCES_PATH = '/v2/money-transfer/balances'

/** "per_page … Number of results per page (default 50, max 100)" */
export const BALANCES_PER_PAGE = 100

/** "GET /v2/money-transfer/balances/{balance_id}/movements" */
export function movementsPath(balanceId: number | string): string {
  return `${BALANCES_PATH}/${encodeURIComponent(String(balanceId))}/movements`
}

/** Movements "limit … Default 100, Max 200" */
export const MOVEMENTS_LIMIT = 200

/** "† : to_date should be within 24 hours of from_date." */
export const MOVEMENT_WINDOW_MS = 24 * 60 * 60 * 1000
