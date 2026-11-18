/**
 * Refrens API constants.
 *
 * Refrens is an Indian invoicing/accounting SaaS platform.
 * Docs: https://www.refrens.com/api/docs/
 *
 * Auth flow (server-side):
 *   POST https://api.refrens.com/authentication
 *   body: { strategy: "app-secret", appId, appSecret }
 *   → { accessToken: "<JWT>" }
 *
 * All resource endpoints are scoped under /businesses/:urlKey/
 *
 * Pagination:  ?$limit=<n>&$skip=<n>
 * Response envelope: { total, limit, skip, data: [...] }
 */

export const REFRENS_API_BASE = 'https://api.refrens.com'
export const REFRENS_AUTH_PATH = '/authentication'

// Refrens does not publish a formal rate limit; use conservative defaults.
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
