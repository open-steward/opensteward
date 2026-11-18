/**
 * Production host. https://developer.forcemanager.com/openapi.json `servers`:
 * "https://api.forcemanager.com/api/v4" (Production); the Sandbox host
 * https://sandbox-api.forcemanager.com/api/v4 is not selectable here.
 */
export const BASE_URL = 'https://api.forcemanager.com/api/v4'

/**
 * Upper bound on upstream pages one whole-collection walk (opportunity
 * statuses, currencies) may request before it gives up. The docs name no
 * maximum collection size; this only stops a server that never returns the
 * documented end-of-list `[]` from looping forever.
 */
export const MAX_WALK_PAGES = 1_000
