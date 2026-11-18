// Qontak CRM (by Mekari) — Indonesia/SE Asia omnichannel CRM
// Website: https://www.qontak.com
//
// Source for every constant below: Qontak's own CRM OpenAPI,
//   https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json
// servers: [{ "url": "https://api.mekari.com", "description": "Production" }]
// and every CRM path lives under `/qontak/crm/*`.
//
// Auth (same document, "B. Authorization"): "We uses HMAC signature for the
// authentication." There is no OAuth flow for this API.

/** Production host. The spec's `servers` lists only this one. */
export const BASE_URL = 'https://api.mekari.com'

/** Every CRM path in the spec starts with this prefix. */
export const CRM_PATH = '/qontak/crm'

/**
 * `per_page` example value on GET /qontak/crm/deals ("Number of items per
 * page", example 25). The spec gives no maximum, so the caller's limit is
 * sent as asked; this is only the size used when a caller names none.
 */
export const DEFAULT_PAGE_SIZE = 25
