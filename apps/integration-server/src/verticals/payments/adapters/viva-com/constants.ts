/**
 * Viva.com API constants.
 *
 * Auth is OAuth2 client credentials, the only grant Viva documents
 * (https://developer.viva.com/integration-reference/oauth2-authentication/):
 * "Base64-encode your credentials in the format Client_ID:Client_Secret" and
 * POST `grant_type=client_credentials` to the token endpoint. "Each token lasts
 * for 3600 seconds (one hour)".
 *
 * Production hosts only. The sandbox hosts (demo-accounts.vivapayments.com,
 * demo-api.vivapayments.com) are documented too, but the adapter has no
 * environment key to choose them.
 */

/** Payment API spec, "Transactions from Data Service": `servers` "https://api.vivapayments.com" (Live environment). */
export const API_BASE_URL = 'https://api.vivapayments.com'

/** OAuth2 page: "Production https://accounts.vivapayments.com/connect/token". */
export const OAUTH_TOKEN_URL = 'https://accounts.vivapayments.com/connect/token'

/** Transactions search `PageSize`: "If not specified, the default value is 10". No maximum is documented. */
export const DEFAULT_PAGE_SIZE = 10

/** Transactions from Data Service search path (Payment API spec, POST). */
export const TRANSACTIONS_SEARCH_PATH = '/dataservices/v2/transactions/Search'

/**
 * Account Transactions search path (Payment API spec, POST, tag "Retrieve
 * Wallets and Transactions"): "Retrieve all transactions for a given timeframe."
 * Its OAuth2 scope is "urn:viva:payments:biservices:datafileapi", and "The
 * Account Transactions API requires specific access credentials".
 */
export const ACCOUNT_TRANSACTIONS_SEARCH_PATH = '/dataservices/v2/accounttransactions/Search'

/** Account Transactions `PageSize`: "Maximum value = 500". */
export const ACCOUNT_TRANSACTIONS_MAX_PAGE_SIZE = 500
