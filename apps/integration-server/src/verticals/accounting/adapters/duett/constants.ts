export const DUETT_API_BASE = 'https://api.duett.no/'

// Duett uses API key authentication — X-Api-Integration-Key + X-Api-Client-Key headers.
// No OAuth flow. Rate limit: 2,500 req/hr.
export const RATE_LIMIT_RPH = 2500
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
