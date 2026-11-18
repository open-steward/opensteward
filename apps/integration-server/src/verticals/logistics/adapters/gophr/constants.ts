/**
 * Production base of the Gophr V2 Commercial API.
 * https://developers.gophr.com/docs/environments.md: "Production API Base Url"
 * = https://api.gophr.com/v2-commercial-api. The trailing slash keeps axios
 * resolving relative paths (`jobs`) under it.
 */
export const GOPHR_API_BASE = 'https://api.gophr.com/v2-commercial-api/'
export const GOPHR_DASHBOARD_URL = 'https://gophr.com/'
export const RATE_LIMIT_RPS = 10
/** List Jobs `count` default: "default": 15 (https://developers.gophr.com/reference/get-job.md). */
export const GOPHR_DEFAULT_COUNT = 15
