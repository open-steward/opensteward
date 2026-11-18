/**
 * Zoho BugTracker API constants.
 *
 * Base URL: https://projectsapi.zoho.com/restapi
 * Portal-scoped: all resources live under /portal/[PORTALID]/
 * Bugs are the primary "task" resource.
 */
export const API_BASE_URL = 'https://projectsapi.zoho.com/restapi'
/** Base URL for Zoho BugTracker v3 API (e.g. tags) */
export const API_V3_BASE_URL = 'https://projectsapi.zoho.com/api/v3'
export const OAUTH_AUTHORIZE_URL = 'https://accounts.zoho.com/oauth/v2/auth'
export const OAUTH_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token'

/** Max records per page the API accepts */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Minimum scopes to read portals, projects, bugs, users, and comments.
 * ZohoBugTracker.<module>.READ covers read access per module.
 */
export const DEFAULT_SCOPES = [
  'ZohoBugTracker.portals.READ',
  'ZohoBugTracker.projects.READ',
  'ZohoBugTracker.bugs.READ',
  'ZohoBugTracker.users.READ',
  'ZohoBugtracker.tags.READ',
]
