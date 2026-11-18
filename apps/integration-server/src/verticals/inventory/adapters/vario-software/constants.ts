/**
 * VARIO Cloud REST API constants.
 *
 * Base URL is tenant-specific: https://{tenant}.vario.cloud/api/vario
 * Auth: OAuth 2.0 Bearer token (password grant).
 *   All requests require a User-Agent header (403 if missing).
 * Rate limit: 40 requests per 6 seconds; 429 response with
 *   x-rate-limit-retry-after-seconds header.
 * Pagination (VQL): limit + offset in POST body; response headers
 *   x-query-more-elements / x-query-next-offset for cursor iteration.
 * Pagination (stockjournal REST): JSON-serialised query params
 *   selection={"type":"..."}&pageable={"_start":N,"_limit":N}
 */
export const API_BASE_URL_TEMPLATE = 'https://{tenant}.vario.cloud/api/vario'
export const SSO_TOKEN_ENDPOINT_TEMPLATE =
  'https://sso.vario.cloud/realms/{tenant}/protocol/openid-connect/token'
export const DEFAULT_PAGE_SIZE = 100
export const USER_AGENT = 'OpenSteward-VARIO-Adapter/0.1'
