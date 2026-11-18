/**
 * Yellow.ai REST API constants.
 *
 * Servers, from the OpenAPI "servers" list every docs.yellow.ai/api page
 * ships: "https://cloud.yellow.ai" (India), "https://r1.cloud.yellow.ai"
 * (MEA), "https://r2.cloud.yellow.ai/cdp/api/v1" (Indonasia),
 * "https://r3.cloud.yellow.ai" (Singapore), "https://r4.cloud.yellow.ai"
 * (USA), "https://r5.cloud.yellow.ai" (Europe).
 *
 * Auth: securitySchemes ApiKeyAuth { "type": "apiKey", "in": "header",
 * "name": "x-api-key" }; "Pass the API key in the header as x-api-key."
 * (https://docs.yellow.ai/docs/platform_concepts/get_started/api-keys)
 */

/** Documented India server — the default when a connection names no region. */
export const INDIA_BASE_URL = 'https://cloud.yellow.ai'

/**
 * Region code → documented server origin.
 *
 * `r0` is not a Yellow.ai code: it is the value this adapter used to store
 * for India, kept so existing connections keep working. r2's documented
 * server carries a `/cdp/api/v1` path; only its origin is used here, since
 * the documented operation paths already start at the origin.
 */
export const REGION_BASE_URLS: Readonly<Record<string, string>> = {
  r0: INDIA_BASE_URL,
  r1: 'https://r1.cloud.yellow.ai',
  r2: 'https://r2.cloud.yellow.ai',
  r3: 'https://r3.cloud.yellow.ai',
  r4: 'https://r4.cloud.yellow.ai',
  r5: 'https://r5.cloud.yellow.ai',
}

/** Stored for India by exchangeCredentials (see REGION_BASE_URLS). */
export const DEFAULT_REGION = 'r0'
