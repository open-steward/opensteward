/**
 * Instamojo API constants.
 *
 * Instamojo uses standard OAuth2 authorization-code flow (Mojo Developers
 * Program, MDP).
 *
 * Docs: https://docs.instamojo.com/v2-mdp/reference/authentication-flow
 */

/**
 * https://docs.instamojo.com/v2-mdp/reference/setup1: "The base API endpoint
 * for the production environment is <https://api.instamojo.com/>" and "Base
 * OAuth endpoint for the production environment is <https://www.instamojo.com/>".
 * The MDP list endpoints live under /v2/ on the API host.
 */
export const API_BASE_URL = 'https://api.instamojo.com'
export const OAUTH_AUTHORIZE_URL = 'https://www.instamojo.com/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://www.instamojo.com/oauth2/token/'

export const DEFAULT_SCOPES = ['payments:read', 'payouts:read', 'orders:read', 'user-info:read']
