/**
 * Jira Service Management Cloud REST API constants.
 *
 * OAuth 2.0 (3LO) flow:
 *   authorize → https://auth.atlassian.com/authorize
 *   token     → https://auth.atlassian.com/oauth/token
 *
 * After token exchange the response includes an `accessibleResources` payload;
 * the cloudId for the target site is stored in credentials.extra.cloudId.
 *
 * API calls:
 *   Service Desk API → https://api.atlassian.com/ex/jira/{cloudId}/rest/servicedeskapi
 *   Jira Platform v3 → https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3
 *
 * Docs: https://developer.atlassian.com/cloud/jira/service-desk/rest/intro/
 */

export const OAUTH_AUTHORIZE_URL = 'https://auth.atlassian.com/authorize'
export const OAUTH_TOKEN_URL = 'https://auth.atlassian.com/oauth/token'
export const ACCESSIBLE_RESOURCES_URL =
  'https://api.atlassian.com/oauth/token/accessible-resources'

/**
 * Base URL templates — replace {cloudId} at request time from
 * credentials.extra.cloudId.
 */
export const SERVICEDESK_API_TEMPLATE =
  'https://api.atlassian.com/ex/jira/{cloudId}/rest/servicedeskapi'
export const JIRA_API_TEMPLATE =
  'https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3'

export const DEFAULT_PAGE_SIZE = 50

/**
 * Minimum read-only scopes for this adapter.
 * offline_access is required to receive a refresh token.
 */
export const DEFAULT_SCOPES = [
  'read:servicedesk-request',
  'read:jira-user',
  'offline_access',
]

/**
 * `limit` sent to Service Desk list endpoints: their documented default ("Default:
 * 50"). JSM may cap it lower per method ("the limits set for each resource's method
 * is an implementation detail"), so the adapter advances by rows returned.
 */
export const SD_UPSTREAM_PAGE_SIZE = 50

/** `maxResults` sent to /rest/api/3/users/search ("limited to 1000"). */
export const USERS_SEARCH_PAGE_SIZE = 100
