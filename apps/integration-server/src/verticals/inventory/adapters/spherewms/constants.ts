/**
 * SphereWMS REST API constants.
 *
 * Auth: api_key passed as `key` query parameter (or header `key: {api_key}`).
 * The environment name is provided per-client by SphereWMS support and forms
 * the last path segment of the base URL.
 *
 * Base URL pattern: https://api.spherewms.com/v2/wms/{environment}/
 */
export const API_BASE_URL_PREFIX = 'https://api.spherewms.com/v2/wms'
export const DEFAULT_PAGE_SIZE = 100
