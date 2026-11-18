/**
 * Volusion REST API constants.
 *
 * Volusion's V1 REST API uses API-key auth via an `apiKey` query-string
 * parameter (legacy) or OAuth2 bearer tokens (V2 storefronts). We support
 * both — the adapter reads whichever credential is present.
 *
 * The base URL is store-specific: `https://{store}.volusion.com/api/v1/` or
 * the newer `https://api.volusion.com/v1/` with a store header.
 */
export const DEFAULT_BASE_URL = 'https://api.volusion.com/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
