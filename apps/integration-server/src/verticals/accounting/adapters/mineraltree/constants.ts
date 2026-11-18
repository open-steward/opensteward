/**
 * MineralTree TotalAP API constants.
 *
 * MineralTree uses a session-token auth flow:
 *   POST /mtapi/base/security/login (Authorization: MT <credentials>)
 *   → ETag header = session artifact
 *   Subsequent requests: If-Match: <session-artifact>
 *
 * The production API base URL is customer-specific (on-prem / SaaS-hosted).
 * The default points to the MineralTree SaaS environment. Customers that
 * self-host supply their own base URL via the `baseUrl` credential field.
 *
 * Docs: Core MineralTree API User Guide v5.28
 */

export const MINERALTREE_API_BASE_DEFAULT = 'https://app.mineraltree.com'
export const MINERALTREE_LOGIN_PATH = '/mtapi/base/security/login'
export const MINERALTREE_SERVICES_PATH = '/mtapi/base/services'

// Pagination defaults (search endpoint)
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500
