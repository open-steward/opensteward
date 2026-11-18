/**
 * Skribble REST API v2 constants.
 *
 * Docs: https://api.skribble.com/v2 — Swiss eIDAS QES + ZertES qualified
 * trust service provider. Auth is server-to-server: POST username + api-key
 * to `/access/login`, receive a short-lived JWT, present it as a bearer
 * token on subsequent calls.
 */
export const API_BASE_URL = 'https://api.skribble.com/v2'
export const LOGIN_URL = 'https://api.skribble.com/v2/access/login'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES: string[] = []
