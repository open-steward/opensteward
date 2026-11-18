/**
 * Inventory Planner (by Sage) REST API constants.
 *
 * Auth: API key + Account ID sent as plain headers:
 *   Authorization: <api_key>
 *   Account: <account_id>
 *
 * Keys are generated in Account → Settings → API.
 * Base URL: https://app.inventory-planner.com
 * Path pattern: /api/v1/<plural_entity>[/<id>]
 * Pagination: limit (max 1000) + page (1-based)
 */
export const API_BASE_URL = 'https://app.inventory-planner.com'
export const API_V1 = '/api/v1'
export const DEFAULT_PAGE_SIZE = 100
