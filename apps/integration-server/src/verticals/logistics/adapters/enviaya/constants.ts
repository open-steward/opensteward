export const ENVIAYA_API_BASE = 'https://enviaya.com.mx/api/v1/'

/**
 * EnviaYa's documented carrier catalogue lives under /api/v2, not the v1 base:
 * "Get all services" in the Postman collection behind https://docs.enviaya.com.mx/.
 * That request points at http://localhost:3001; this production URL is the one
 * its saved example's originalRequest uses:
 * GET https://enviaya.com.mx/api/v2/carrier_services/services_map?api_key=API_KEY
 */
export const ENVIAYA_SERVICES_MAP_URL =
  'https://enviaya.com.mx/api/v2/carrier_services/services_map'

// EnviaYa uses API key auth — no OAuth endpoints
export const ENVIAYA_DASHBOARD_URL = 'https://enviaya.com.mx/profile'
