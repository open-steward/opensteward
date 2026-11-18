/**
 * Splitit API constants.
 *
 * Splitit uses OAuth2 client-credentials via their ID server.
 * Scopes: api.v1, api.v3.
 *
 * Docs: https://developers.splitit.com/api/v3/authenticate/
 */

export const OAUTH_AUTHORIZE_URL = 'https://id.production.splitit.com/connect/authorize'
export const OAUTH_TOKEN_URL = 'https://id.production.splitit.com/connect/token'

export const DEFAULT_SCOPES = ['api.v1', 'api.v3']
