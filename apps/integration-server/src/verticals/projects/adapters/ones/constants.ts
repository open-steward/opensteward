/**
 * ONES OpenAPI v2 endpoints.
 *
 * ONES is multi-tenant / self-hostable, so the API and OAuth hosts are
 * scoped to the customer's own domain (e.g. `https://acme.ones.com`). There
 * is no default: the domain is collected per connection (`oauthFields`),
 * stored on `credentials.extra.domain`, and the concrete URLs are derived
 * from the path constants below.
 *
 * Docs: https://docs.ones.com/developer/openapi/authorization
 */

/** API base path appended to the configured domain. */
export const API_BASE_PATH = '/openapi/v2'
/** OAuth2 authorize path appended to the configured domain. */
export const OAUTH_AUTHORIZE_PATH = '/oauth2/authorize'
/** OAuth2 token path appended to the configured domain. */
export const OAUTH_TOKEN_PATH = '/oauth2/token'

/**
 * `limit` on the cursor list endpoints: "Default value: 50 ... exceeding 100
 * will be truncated to 100" (docs.ones.com/developer/openapi/api/01-get-team-project-list/).
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Read-only OpenAPI scopes for the projects vertical. ONES uses
 * `<action>:<product>:<resource>` scope strings.
 */
export const DEFAULT_SCOPES = [
  'read:project:project',
  'read:project:issue',
  'read:project:issue-comment',
  'read:account:user',
]

function trimDomain(domain: string): string {
  return domain.replace(/\/+$/, '')
}

export function apiBaseUrl(domain: string): string {
  return `${trimDomain(domain)}${API_BASE_PATH}`
}

export function authorizeUrl(domain: string): string {
  return `${trimDomain(domain)}${OAUTH_AUTHORIZE_PATH}`
}

export function tokenUrl(domain: string): string {
  return `${trimDomain(domain)}${OAUTH_TOKEN_PATH}`
}
