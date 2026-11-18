/**
 * Freightify — Ocean Freight Rate Management Platform
 *
 * Freightify LINK provides an API to retrieve live ocean carrier rates,
 * sailing schedules, and container track-and-trace data.
 *
 * Auth: API key passed as the `api-key` header.
 * Docs: https://freightify.com/products/api-product
 *
 * KNOWN GAP (not fixed here): the Schedules spec
 * (https://cdn.freightbro.in/docs/schedules/freightify-api.yaml) gives
 * "servers: - url: https://api.freightify.com" (Production), and both it and
 * the Track & Trace spec (https://cdn.freightbro.in/docs/track/freightify-api.yaml)
 * give auth by OAuth2 password flow or
 * "AwsApiKey": { "type": "apiKey", "in": "header", "name": "x-api-key" }.
 * This base URL and the `api-key` header below are not documented.
 */
export const FREIGHTIFY_API_BASE = 'https://api.freightify.io/v1/'

export const FREIGHTIFY_DASHBOARD_URL = 'https://app.freightify.com/settings/api-keys'
