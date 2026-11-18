/**
 * Forethought API constants.
 *
 * Solve API  — conversational AI widget/headless channel.
 *   Base: https://app.forethought.ai/solve/api/v1
 *   Auth: Authorization: Bearer {token}
 *
 * Triage API — ML ticket classification (inference-only, not a read resource).
 *   Base: https://api.forethought.ai
 *   Auth: Authorization: Bearer {token}
 *
 * Docs: https://support.forethought.ai/hc/en-us/articles/31636750750227-Solve-API-Developer-Reference
 *       https://support.forethought.ai/hc/en-us/articles/26701042038419-Triage-API-Guide-for-Users
 */
export const SOLVE_API_BASE_URL = 'https://app.forethought.ai/solve/api/v1'
export const TRIAGE_API_BASE_URL = 'https://api.forethought.ai'

/** Default page size for paginated requests. */
export const DEFAULT_PAGE_SIZE = 50
