/**
 * M-Pesa Daraja API constants.
 *
 * M-Pesa uses Basic Auth (Consumer Key:Consumer Secret) for access tokens.
 * There is no user-facing OAuth authorize URL — tokens are obtained via
 * client-credentials using the Daraja API portal credentials.
 *
 * Docs: https://developer.safaricom.co.ke
 */

export const API_BASE_URL = 'https://api.safaricom.co.ke'
export const OAUTH_AUTHORIZE_URL = 'https://api.safaricom.co.ke/oauth/v1/generate'
export const OAUTH_TOKEN_URL = 'https://api.safaricom.co.ke/oauth/v1/generate'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/** M-Pesa scopes are product-based (STK Push, C2B, B2C, B2B). */
export const DEFAULT_SCOPES = ['stk_push', 'c2b', 'b2c']
