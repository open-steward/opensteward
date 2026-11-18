/**
 * Zendesk REST API constants. Per-tenant subdomain — baseURL templated
 * at request time via credentials.extra.tenantSubdomain.
 */
export const API_BASE_URL_TEMPLATE = 'https://{subdomain}.zendesk.com/api/v2'
export const OAUTH_AUTHORIZE_URL_TEMPLATE = 'https://{subdomain}.zendesk.com/oauth/authorizations/new'
export const OAUTH_TOKEN_URL_TEMPLATE = 'https://{subdomain}.zendesk.com/oauth/tokens'

export const DEFAULT_PAGE_SIZE = 100
/**
 * Every list endpoint this adapter calls (tickets, ticket comments, users,
 * tags, groups, macros) says "Returns a maximum of 100 records per page.", and
 * the pagination guide says of `page[size]`: "Most endpoints limit this to a
 * maximum of 100."
 * https://developer.zendesk.com/api-reference/introduction/pagination/
 */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_SCOPES = ['read']
