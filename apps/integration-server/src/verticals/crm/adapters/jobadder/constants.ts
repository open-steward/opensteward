/** JobAdder REST API v2 — https://api.jobadder.com/v2/docs */

export const JOBADDER_BASE_URL = 'https://api.jobadder.com/v2'
export const JOBADDER_AUTH_URL = 'https://id.jobadder.com/connect/authorize'
export const JOBADDER_TOKEN_URL = 'https://id.jobadder.com/connect/token'

export const DEFAULT_PAGE_SIZE = 25

/**
 * Documented `Limit` maximum on every v2 list operation
 * (https://api.jobadder.com/v2/openapi.json: "name": "Limit", ... "maximum": 1000).
 */
export const MAX_PAGE_SIZE = 1000

/**
 * Default OAuth2 scopes.
 *
 * `read` — view all JobAdder data (candidates, contacts, companies, jobs, placements, notes).
 * `write` — create/update records.
 * `offline_access` — obtain a refresh token for long-lived access.
 *
 * Operators can override per connection via the mint form.
 */
export const DEFAULT_JOBADDER_SCOPES: readonly string[] = [
  'read',
  'write',
  'offline_access',
]
