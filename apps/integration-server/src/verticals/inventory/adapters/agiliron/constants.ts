/**
 * Agiliron REST API v4.0 constants.
 *
 * Base URL uses the tenant company subdomain. Auth: api_key passed as the
 * `key` query parameter OR as the `apiKey` request header on every call.
 *
 * Endpoint reference: https://api.agiliron.com/llms.txt
 * Base URL pattern:   https://{company}.agiliron.net/agiliron/api-40/{Resource}
 */
export const API_BASE_URL_TEMPLATE = 'https://{company}.agiliron.net/agiliron/api-40'
export const DEFAULT_PAGE_SIZE = 50
