/**
 * Salesforce Service Cloud constants. Every value is taken from a Salesforce
 * page fetched 2026-09-28; the URL is next to each.
 */

/**
 * Where the OAuth 2.0 authorize and token endpoints live, per org kind.
 * "For standard OAuth 2.0 authorization flows, these host domains are
 * supported ... login.salesforce.com ... For sandboxes, use
 * test.salesforce.com" — OAuth Endpoints,
 * https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_endpoints.htm&type=5
 */
export const LOGIN_HOSTS = {
  production: 'https://login.salesforce.com',
  sandbox: 'https://test.salesforce.com',
} as const

export type SalesforceEnvironment = keyof typeof LOGIN_HOSTS

/** `https://hostname/services/oauth2/authorize` (same page). */
export const AUTHORIZE_PATH = '/services/oauth2/authorize'
/** `https://hostname/services/oauth2/token` (same page). */
export const TOKEN_PATH = '/services/oauth2/token'

/**
 * Scopes asked for when neither the caller nor the deployment names any.
 * `api`: "Allows access to the current, logged-in user's account by using
 * APIs, such as REST API"; `refresh_token`: "Allows a refresh token to be
 * returned". Salesforce has no read-only scope: `api` also writes.
 * https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_tokens_scopes.htm&type=5
 */
export const DEFAULT_SCOPES = ['api', 'refresh_token']

/**
 * REST API version, pinned to the one crm/salesforce already calls.
 * URIs are `/services/data/vXX.X/...`:
 * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/dome_query.htm
 */
export const API_VERSION = 'v60.0'

/**
 * `Sforce-Query-Options: batchSize=N`: "The default is 2,000; the minimum is
 * 200, and the maximum is 2,000."
 * https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/headers_queryoptions.htm
 */
export const MIN_QUERY_BATCH_SIZE = 200
export const MAX_QUERY_BATCH_SIZE = 2000

/** The caller's page size when a direct call names none (as crm/salesforce). */
export const DEFAULT_LIST_LIMIT = 25
