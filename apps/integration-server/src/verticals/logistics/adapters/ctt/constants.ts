/**
 * CTT's e-commerce shipping API ("envios e-commerce") is a white-label of the
 * Pakketmail platform. CTT's own OpenAPI document, served unauthenticated at
 * https://enviosecommerceapi.ctt.pt/v3/openapi/, declares:
 *
 *   "servers":[{"url":"https://enviosecommerceapi.ctt.pt/v3/","description":"Base URL for the API"}]
 *
 * The human-readable pages for the same API are Pakketmail's, at
 * https://api.pakketmail.nl/v3/apidocs/usa/ (CTT's own /v3/apidocs/ pages now
 * answer with empty bodies). The previous host, api.ctt.pt/v1, is an API
 * gateway that answers 404 for every path this adapter used.
 */
export const CTT_API_BASE = 'https://enviosecommerceapi.ctt.pt/v3/'

export const CTT_DASHBOARD_URL = 'https://enviosecommerceapi.ctt.pt/'

/**
 * GET /shipments/newsince/:startNumber/:iso3339Date
 * (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/shipments/newsince/GET):
 * "Each request will return 25 shipments at most ... If the list is longer
 * than 25 items, a second request is done and the start item is set to 26,
 * etc. at a rate of 1 request per second at most."
 */
export const NEWSINCE_PAGE_SIZE = 25
export const NEWSINCE_MIN_INTERVAL_MS = 1000

/**
 * POST /keys/ requires `PlatformVersion` and `PluginVersion` ("String required
 * Minimum length: 1, maximum length: 20"): the version of the calling platform
 * and plugin, i.e. OpenSteward's own identity, not a CTT value.
 */
export const CTT_PLATFORM_VERSION = '1'
export const CTT_PLUGIN_VERSION = '1'
