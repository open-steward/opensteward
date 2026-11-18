/**
 * Leantime is a self-hosted project management tool. The API endpoint is
 * relative to the user's own installation (no fixed cloud URL). We expose a
 * placeholder that the caller overrides via the `baseUrl` credential field.
 *
 * All API calls go to a single JSON-RPC endpoint: POST {baseUrl}/api/jsonrpc
 * Authentication: `x-api-key` request header.
 */

/** Sentinel used when no base URL has been set. */
export const JSONRPC_PATH = '/api/jsonrpc'

/** API key help / docs URL — shown in the Connect Link form. */
export const API_KEY_HELP_URL = 'https://docs.leantime.io/api/getting-started'

export const DEFAULT_PAGE_SIZE = 100
