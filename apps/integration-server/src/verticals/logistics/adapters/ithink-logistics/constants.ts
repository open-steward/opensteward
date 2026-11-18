/**
 * Production host of the iThink Logistics v3 API. Every v3 page names it, e.g.
 * https://docs.ithinklogistics.com/doc-get-warehouse/3: "Production URL
 * https://my.ithinklogistics.com/api_v3/warehouse/get.json". Staging is
 * https://pre-alpha.ithinklogistics.com/api_v3/.
 */
export const ITHINK_API_BASE = 'https://my.ithinklogistics.com/api_v3/'

/**
 * Tracking alone is served from another host
 * (https://docs.ithinklogistics.com/doc-track-order/3): "Production URL
 * https://api.ithinklogistics.com/api_v3/order/track.json".
 */
export const ITHINK_TRACK_URL = 'https://api.ithinklogistics.com/api_v3/order/track.json'

export const ITHINK_DASHBOARD_URL = 'https://docs.ithinklogistics.com/'

/**
 * order/get_details.json (https://docs.ithinklogistics.com/doc-order-details/3):
 * "Date range from which order's data is needed(maximum 500 AWB details in one
 * request)".
 */
export const ORDER_DETAILS_MAX_AWBS = 500

export const RATE_LIMIT_RPS = 10
