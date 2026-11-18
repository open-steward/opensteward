/**
 * Redmine REST API constants.
 *
 * Redmine is self-hosted. The REST API lives directly at the root of the
 * instance (e.g., `https://redmine.example.com`). Endpoints use JSON format:
 * `/projects.json`, `/issues.json`, etc.
 *
 * Auth: `X-Redmine-API-Key` header. The API key is generated at
 * `/my/account` in the user's Redmine instance.
 *
 * Pagination: `offset` (0-based start index) + `limit` (max 100 per page).
 */

/** Canonical public demo instance — individual installs supply their own host. */
export const DEFAULT_HOST = 'https://demo.redmine.org'

/** Link shown in Connect Link help text. */
export const API_KEY_HELP_URL =
  'https://www.redmine.org/projects/redmine/wiki/Rest_api#Authentication'

/**
 * Maximum number of items per page. Redmine caps this at 100.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Documented ceiling of `limit` on every collection resource: "limit: the
 * number of items to be present in the response (default is 25, maximum is
 * 100)" — https://www.redmine.org/projects/redmine/wiki/Rest_api#Collection-resources-and-pagination
 */
export const MAX_PAGE_SIZE = 100
