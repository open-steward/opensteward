export const TRACKINGMORE_API_BASE = 'https://api.trackingmore.com/v4'

// TrackingMore uses API key auth — direct users to the dashboard
export const TRACKINGMORE_DASHBOARD_URL = 'https://admin.trackingmore.com/developer/apikey'

// Rate limits: 10 requests per second per API key
export const RATE_LIMIT_RPS = 10
export const DEFAULT_PAGE_SIZE = 40
export const MAX_PAGE_SIZE = 100
// Batch create supports up to 40 trackings at once
export const MAX_BATCH_SIZE = 40
