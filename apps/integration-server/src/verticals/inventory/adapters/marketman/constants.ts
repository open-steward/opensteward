/**
 * MarketMan REST API v3 constants.
 *
 * Auth: APIKey + APIPassword → POST /buyers/auth/GetToken → AUTH_TOKEN header.
 * MarketMan is a restaurant-focused inventory management platform.
 * Docs: https://api-doc.marketman.com/
 */
export const API_BASE_URL = 'https://api.marketman.com/v3'
export const TOKEN_PATH = '/buyers/auth/GetToken'
export const ACCOUNTS_PATH = '/buyers/partneraccounts/GetAuthorisedAccounts'
