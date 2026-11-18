// Account-level API (db-list, open-db) — static base URL
export const ACCURATE_ACCOUNT_API_BASE = 'https://account.accurate.id/api'
// Data-level API — the host is dynamic, returned by the open-db.do endpoint as `host`.
// Full path pattern: {host}/accurate/api/{resource}
// e.g. https://public.accurate.id/accurate/api/sales-invoice/list.do
export const ACCURATE_DATA_API_PATH = '/accurate/api'
export const ACCURATE_AUTH_URL = 'https://account.accurate.id/oauth/authorize'
export const ACCURATE_TOKEN_URL = 'https://account.accurate.id/oauth/token'
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
