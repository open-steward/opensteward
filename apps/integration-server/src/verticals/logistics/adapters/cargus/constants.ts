// Cargus (UrgentCargus) API base URL — all paths are relative to this root.
// The developer portal lists one gateway host for the UrgentOnlineAPI,
// urgentcargus.azure-api.net, and every operation's urlTemplate starts /api/.
export const CARGUS_API_BASE = 'https://urgentcargus.azure-api.net/api/'

// Authentication: the portal issues an API key (subscription key) which must
// accompany every request as `Ocp-Apim-Subscription-Key`.  Session tokens are
// obtained via POST /LoginUser and placed in the Authorization header.
export const CARGUS_DASHBOARD_URL = 'https://urgentcargus.developer.azure-api.net/'

// Cargus operates in Romania; currency is always RON.
export const CARGUS_DEFAULT_CURRENCY = 'RON'
