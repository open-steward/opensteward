// Visma.net ERP — distinct from Visma eAccounting (src/adapters/visma)
export const VISMANET_AUTH_URL = 'https://connect.visma.com/connect/authorize'
export const VISMANET_TOKEN_URL = 'https://connect.visma.com/connect/token'
export const VISMANET_API_BASE = 'https://integration.visma.net/API/'

// Rate limit: 1,000 req/hr (~16/min) for enterprise tier
export const RATE_LIMIT_RPH = 1000
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
