/**
 * Sign.Plus (Alohi) eSignature REST API v2 constants.
 *
 * Sign.Plus exposes a single hosted REST API. There is no separate sandbox
 * host — sandbox testing is opt-in per request via a `sandbox: true` flag on
 * envelope creation (a write operation this read-only adapter doesn't perform),
 * so the same base URL serves production and sandbox reads.
 *
 * Auth is a static API key / Personal Access Token passed as a Bearer token
 * (`Authorization: Bearer <key>`); there is no OAuth token-refresh flow. Keys
 * are minted on the Integrations page at https://app.sign.plus/profile/integrations.
 *
 * Docs: https://apidoc.sign.plus/get-started/introduction
 */
export const API_BASE_URL = 'https://restapi.sign.plus/v2'

/**
 * Cursor-paginated list endpoints take `first` (page size) + `after`
 * (opaque cursor). Sign.Plus does not document a hard ceiling; we cap the
 * page size at a conservative default to bound response size.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
