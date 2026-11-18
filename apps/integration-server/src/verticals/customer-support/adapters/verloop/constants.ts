/**
 * Verloop.io Campaign API constants.
 *
 * Base URL is per-tenant: https://<client_id>.verloop.io
 * The client_id (subdomain) is stored in credentials.extra.clientId.
 *
 * API reference: https://help.verloop.io/knowledge-base/verloop-campaign-api/
 */

export const API_BASE_URL_TEMPLATE = 'https://{clientId}.verloop.io/api/v1'
export const DEFAULT_PAGE_SIZE = 50

/**
 * The largest `ListOption.Limit` ListCampaigns and ListTemplates accept. Both
 * answer more with: "msg": "ListOption.Limit is capped at 100"
 * https://help.verloop.io/knowledge-base/verloop-campaign-api/
 */
export const MAX_PAGE_SIZE = 100
