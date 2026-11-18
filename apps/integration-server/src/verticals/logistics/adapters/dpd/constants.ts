// The host root. DPD's own server answers POST /user/?action=login with 401
// "Unauthorized" and POST /v1/user/?action=login with 404
// "Cannot POST /esgServer/v1/user/?action=login" (live probes, 2026-09-24):
// there is no /v1/ segment.
export const DPD_API_BASE = 'https://api.dpd.co.uk/'
export const DPD_LOGIN_PATH = 'user/?action=login'
export const DPD_DASHBOARD_URL = 'https://www.dpd.com/developer'

export const RATE_LIMIT_RPS = 20
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const TOKEN_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours
