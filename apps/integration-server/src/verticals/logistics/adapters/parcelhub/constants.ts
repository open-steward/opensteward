/**
 * Parcelhub hosts, from the OpenAPI embedded in the first-party docs at
 * https://api.parcelhub.net/docs/ (Docusaurus; the spec ships in its JS chunks).
 *
 * Shipping API: `servers: [{url: "https://api.test.parcelhub.net"}, {url:
 * "https://api.parcelhub.net"}]`, with paths such as `/1.0/TokenV2` and
 * `/1.0/Shipment/{id}`. The adapter's old host, api.parcelhub.co.uk/v3, has no
 * DNS record.
 *
 * Tracking API: `servers: [{url: "https://trackapi.parcelhub.net"}]`, with paths
 * such as `/v1/trackingservice/gettrackinghistory`.
 */
export const PARCELHUB_API_BASE = 'https://api.parcelhub.net/1.0/'

export const PARCELHUB_TOKEN_URL = 'https://api.parcelhub.net/1.0/TokenV2'

export const PARCELHUB_TRACKING_API_BASE = 'https://trackapi.parcelhub.net/v1/trackingservice/'

export const PARCELHUB_DASHBOARD_URL = 'https://api.parcelhub.net/docs/'

/**
 * https://api.parcelhub.net/docs/shippingAPI/get-bearer-token/ : "The Expiry
 * time will tell you how long your Access Token is valid for. At the time of
 * writing this is 4 hours." The `expiresIn` field's unit is not documented (the
 * schema example is 3600, the response example 360000), so the documented
 * lifetime is used instead of it.
 */
export const PARCELHUB_ACCESS_TOKEN_TTL_MS = 4 * 60 * 60 * 1000

export const RATE_LIMIT_RPS = 20
