// Synder Importer API — https://importer.synder.com/apidocs
// Authentication: Bearer token (static API key from Account → API Keys)
// No OAuth2 flow; no sandbox environment (all calls operate on live data)

export const SYNDER_API_BASE = 'https://importer.synder.com/api/v1'

// Rate limits
export const RATE_LIMIT_RPM = 60
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 20
