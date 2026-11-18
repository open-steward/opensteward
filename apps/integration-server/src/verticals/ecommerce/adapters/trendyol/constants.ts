/**
 * Trendyol Partner API constants.
 *
 * The Trendyol API Gateway (apigw) hosts all seller integration endpoints.
 * The stage environment is available for testing and requires IP allowlisting
 * on the Trendyol side. Production does not require IP allowlisting.
 *
 * All resource paths embed the sellerId (supplierId) as a path segment, e.g.:
 *   /integration/product/sellers/{sellerId}/products
 *
 * Auth: HTTP Basic using apiKey:apiSecret (base64-encoded), plus a mandatory
 * User-Agent header in the format "{sellerId} - SelfIntegration".
 *
 * Docs: https://developers.trendyol.com/
 */

export const PROD_BASE_URL = 'https://apigw.trendyol.com'
export const STAGE_BASE_URL = 'https://stageapigw.trendyol.com'

/** Default environment. Can be overridden to 'stage' for testing. */
export const DEFAULT_ENV: 'prod' | 'stage' = 'prod'

/**
 * Page size limits. Trendyol imposes a 50-req/10-sec rate limit per endpoint;
 * keep pages reasonably sized to avoid hammering the limit.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

/** Rate limit: max 50 requests per endpoint per 10 seconds. */
export const RATE_LIMIT_WINDOW_MS = 10_000
export const RATE_LIMIT_MAX_REQUESTS = 50
