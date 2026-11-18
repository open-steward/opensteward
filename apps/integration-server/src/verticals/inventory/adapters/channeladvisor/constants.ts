/**
 * ChannelAdvisor (Rithum) REST API v1 constants.
 *
 * Auth: OAuth 2.0 authorization-code flow with refresh tokens.
 * Base: https://api.channeladvisor.com/v1
 * Token: https://api.channeladvisor.com/oauth2/token
 * Rate: 2,000 req/min per profile; 5 concurrent per integration.
 * Pagination: OData $skip / $top / @odata.nextLink
 */
export const API_BASE_URL = 'https://api.channeladvisor.com/v1'
export const OAUTH_TOKEN_URL = 'https://api.channeladvisor.com/oauth2/token'
export const OAUTH_AUTHORIZE_URL = 'https://api.channeladvisor.com/oauth2/authorize'
export const DEFAULT_PAGE_SIZE = 100
