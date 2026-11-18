/**
 * https://docspring.com/api-docs/v1/swagger.json (linked from
 * https://docspring.com/docs/api-guide/openapi-schema/):
 *   "host": "sync.api.docspring.com", "basePath": "/api/v1"
 * and https://docspring.com/docs/api-guide/synchronous-requests/:
 *   "We recommend using the sync.api.docspring.com subdomain for all API
 *    requests. The synchronous subdomain supports all API endpoints"
 */
export const API_BASE_URL = 'https://sync.api.docspring.com/api/v1'

/**
 * `GET /templates` `per_page`: "minimum": 1, "maximum": 50, "description": "Default: 50"
 * (https://docspring.com/api-docs/v1/swagger.json).
 */
export const TEMPLATES_MAX_PER_PAGE = 50
