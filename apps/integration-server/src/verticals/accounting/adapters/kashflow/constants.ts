export const KASHFLOW_API_BASE = 'https://api.kashflow.com/v2'

// Endpoint to exchange username+password for a session token
export const KASHFLOW_SESSION_URL = `${KASHFLOW_API_BASE}/sessiontoken`

// Rate limits are not officially published; conservative defaults
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250
