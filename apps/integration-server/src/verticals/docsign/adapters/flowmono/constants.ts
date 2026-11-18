/**
 * Flowmono eSign API constants.
 *
 * Flowmono authenticates requests with a Bearer token supplied via the
 * `Authorization` header. The token, together with the appId, apiClientId,
 * subscriberId, and userId, are collected through the Connect Link
 * credential form (no OAuth Authorization-Code flow is offered for
 * server-to-server integrations).
 *
 * UNVERIFIED: https://api.flowmono.com/swagger/v1/swagger.json returns HTTP 401
 * (re-checked 2026-09-24), so neither the base URL nor the auth scheme has been
 * confirmed against a first-party spec. The only public API artifact found is
 * the Postman collection "Flowmono  API Collection V2" (unverified publisher),
 * which documents GET /api/ExternalApplication/getsigningrequestbyreferencenumber
 * and none of the list endpoints this adapter calls.
 *
 * Docs: https://www.flowmono.com/en-US/api/e-sign
 */
export const API_BASE_URL = 'https://api.flowmono.com'

/**
 * Page sizes are UNSOURCED: no first-party doc states a default or maximum.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
