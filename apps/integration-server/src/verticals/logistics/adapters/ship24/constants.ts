export const SHIP24_API_BASE = 'https://api.ship24.com/public/v1/'

// Ship24 uses API key auth — no OAuth endpoints
export const SHIP24_DASHBOARD_URL = 'https://app.ship24.com/settings/api-keys'

export const DEFAULT_PAGE_SIZE = 20
// GET /public/v1/trackers `limit`: "The maximum number of trackers returned per
// page." maximum: 500 (https://docs.ship24.com/assets/openapi/ship24-tracking-api.yaml)
export const MAX_PAGE_SIZE = 500
