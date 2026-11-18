/**
 * Zoho Sprints API constants.
 *
 * Base URL:   https://sprintsapi.zoho.com/zsapi
 * Auth:       Authorization: Zoho-oauthtoken <access_token>
 * Rate limit: 30 calls/minute
 * Pagination: index (1-based) + range (record count per page)
 *
 * The Zoho OAuth endpoints are the standard Zoho accounts service.
 * Multi-DC note: Zoho serves EU/AU/IN/JP/CA from region-specific
 * account/API domains; the .com variants are the global defaults.
 */

export const API_BASE_URL = 'https://sprintsapi.zoho.com/zsapi'
export const OAUTH_AUTHORIZE_URL = 'https://accounts.zoho.com/oauth/v2/auth'
export const OAUTH_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Largest documented `range` (https://sprints.zoho.com/apidoc.html,
 * Pagination): "No. of records that have to be listed. The maximum limit is 250."
 */
export const USERS_MAX_RANGE = 250

/**
 * OAuth scopes for Zoho Sprints.
 * ZohoSprints.sprints.READ provides read access to all Sprints resources.
 */
export const DEFAULT_SCOPES = [
  'ZohoSprints.sprints.READ',
  'ZohoSprints.projects.READ',
  'ZohoSprints.teams.READ',
  // "Get workspace users" (listUsers/getUser) documents scope ZohoSprints.teamusers.READ.
  'ZohoSprints.teamusers.READ',
]
