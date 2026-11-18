/**
 * Zip Co BNPL API constants.
 *
 * Zip uses OAuth2 authorization-code flow. Tokens are account-scoped.
 *
 * Docs: https://developers.zip.co/v4/reference/authentication-authorization
 */

export const API_BASE_URL = 'https://api.prod.au.edge.zip.co/v2'
export const OAUTH_AUTHORIZE_URL = 'https://zip.co/login/connect/authorize'
export const OAUTH_TOKEN_URL = 'https://zip.co/login/connect/token'

export const DEFAULT_SCOPES = ['api']
