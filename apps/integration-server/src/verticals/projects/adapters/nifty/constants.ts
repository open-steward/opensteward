/**
 * Nifty (niftypm) REST API constants.
 * Docs: https://developers.niftypm.com/
 */
export const API_BASE_URL = 'https://openapi.niftypm.com/api/v1.0'
export const OAUTH_AUTHORIZE_URL = 'https://openapi.niftypm.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://openapi.niftypm.com/oauth/token'

/** Page size sent when the caller names none (Nifty's own default is 25). */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Largest `limit` sent. Nifty v1.0 documents no maximum. Only GET /tasks gives
 * guidance ("There is no server maximum; keep it at or below 100."); the
 * messages, labels and members endpoints state no cap. The adapter applies
 * 100 to every list as a precaution and reports the size it sent when it clamps.
 */
export const MAX_PAGE_SIZE = 100

/**
 * Read scopes for the projects vertical. Nifty issues granular per-resource
 * scopes (project, task, task_group, message, member, subteam, label, …).
 */
export const DEFAULT_SCOPES = [
  'project',
  'task',
  'task_group',
  'message',
  'label',
  'subteam',
  'member',
]
