/**
 * Bolt REST API constants.
 *
 * Bolt exposes a sandbox and a production host. Merchant API calls live under
 * `/v1/merchant/…`. Auth is a static API key sent in the `X-Api-Key` header,
 * so there is no OAuth handshake and no token endpoint.
 *
 * Docs: https://help.bolt.com/api-bolt/ ·
 *       https://help.bolt.com/developers/tools/environment-details/
 */
export const API_BASE_URL = 'https://api.bolt.com'
export const SANDBOX_API_BASE_URL = 'https://api-sandbox.bolt.com'

/** Bolt's merchant transaction endpoints share this prefix. */
export const TRANSACTIONS_PATH = '/v1/merchant/transactions'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
