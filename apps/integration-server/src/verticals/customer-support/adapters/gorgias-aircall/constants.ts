export const API_BASE_URL = 'https://api.usepylon.com'
export const DEFAULT_PAGE_SIZE = 100
/**
 * GET /contacts: "Must be greater than 0 and less than 1000." The smallest of
 * the cursor endpoints' maxima, so the one the adapter declares.
 * https://docs.usepylon.com/pylon-docs/developer/api/api-reference/contacts.md
 */
export const MAX_PAGE_SIZE = 999
/** GET /issues/{id}/messages: "Must be greater than 0 and at most 1000." */
export const MAX_MESSAGES_PAGE_SIZE = 1000
/** GET /issues: "Must be between 0 and 20000." */
export const MAX_ISSUES_PAGE_SIZE = 20000
