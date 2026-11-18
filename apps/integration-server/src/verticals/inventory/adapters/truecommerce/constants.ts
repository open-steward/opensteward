/**
 * TrueCommerce Foundry API constants.
 *
 * TrueCommerce's supply-chain platform (Foundry) exposes a REST/JSON API at
 * api.truecommerce.com.  Authentication uses OAuth 2.0 client_credentials.
 *
 * Reference: https://developers.truecommerce.com/
 */
export const API_BASE_URL = 'https://api.truecommerce.com/v1'

/** Token endpoint for client_credentials grant. */
export const OAUTH_TOKEN_URL = 'https://auth.truecommerce.com/oauth/token'

/** Default audience required by TrueCommerce's Auth0-backed identity layer. */
export const OAUTH_AUDIENCE = 'https://api.truecommerce.com'

export const DEFAULT_PAGE_SIZE = 100
