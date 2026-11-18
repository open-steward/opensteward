/**
 * Karrio is self-hosted: every customer runs their own instance, so there is
 * no shared API host. The API reference shows a per-instance host,
 * https://docs.karrio.io/reference/openapi ("Authentication"):
 *   "$ curl https://instance.api.com/v1/shipments -u key_xxxxxx:"
 *   "All API requests must be made over HTTPS."
 * The customer's host is collected on the Connect form (credentials.extra.baseUrl)
 * and every API path is resolved under `<host>/v1/`.
 */
export const KARRIO_API_PATH = '/v1/'

// Karrio uses API key auth — no OAuth endpoints
export const KARRIO_DASHBOARD_URL = 'https://app.karrio.io/settings/api'

// Default pagination
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
