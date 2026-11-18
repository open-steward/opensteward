export const SHIPBUBBLE_API_BASE = 'https://api.shipbubble.com/v1/'

// Shipbubble API keys are generated from the dashboard
// Test keys have prefix sb_sandbox, live keys have prefix sb_prod
export const SHIPBUBBLE_DASHBOARD_URL = 'https://app.shipbubble.com/settings/api'

export const DEFAULT_PAGE_SIZE = 20
// GET /shipping/labels `PerPage`: "Default is 50" (docs.shipbubble.com/get-started/pagination).
// No maximum is documented, so every request asks for the default.
export const UPSTREAM_PAGE_SIZE = 50
