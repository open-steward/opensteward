/**
 * SpotOn API constants.
 *
 * SpotOn uses OAuth2 authorization-code flow.
 * User tokens expire in 1 hour (non-refreshable).
 * Service tokens expire in 24 hours.
 *
 * Docs: https://developers.spoton.com/central-api/docs/spoton-oauth-integration-guide
 */

export const OAUTH_AUTHORIZE_URL = 'https://api.spoton.com/oauth2/v1/authorize'
export const OAUTH_TOKEN_URL = 'https://api.spoton.com/oauth2/v1/token'

export const DEFAULT_SCOPES = ['reporting:orders:read', 'menu:all:read', 'business:all:read']
