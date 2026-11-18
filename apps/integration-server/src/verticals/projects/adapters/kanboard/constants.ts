/**
 * Kanboard JSON-RPC endpoint suffix.
 *
 * Kanboard is self-hosted — there is no single cloud base URL.
 * The full endpoint is: <instanceUrl>/jsonrpc.php
 * The instance URL is stored in credentials.extra.baseUrl.
 */
export const JSONRPC_PATH = '/jsonrpc.php'

/** Default batch size for paginated list results. */
export const DEFAULT_PAGE_SIZE = 100
