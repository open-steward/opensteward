/**
 * Skydropx PRO API. The legacy api.skydropx.com/v1 and radar-api hosts are
 * retired: docs.skydropx.com redirects to https://pro.skydropx.com/es-MX/api-docs,
 * whose OpenAPI (https://pro.skydropx.com/es-MX/api-docs.json) declares
 * `servers: [{ url: "https://api-pro.skydropx.com" }]`, and whose credentials
 * guide says "Asegúrate de usar el host correcto: api-pro.skydropx.com."
 */
export const SKYDROPX_API_BASE = 'https://api-pro.skydropx.com/api/v1/'

/**
 * "POST /api/v1/oauth/token … grant_type=client_credentials&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
 * (Content-Type: application/x-www-form-urlencoded).
 */
export const SKYDROPX_TOKEN_URL = 'https://api-pro.skydropx.com/api/v1/oauth/token'

/** "Ve a Conexiones > API y copia tus credenciales (Client ID y Client Secret)." (production link) */
export const SKYDROPX_DASHBOARD_URL = 'https://pro.skydropx.com/merchant_stores/applications'

/** "El token expira en 2 horas y permite hasta 2 solicitudes por segundo." */
export const RATE_LIMIT_RPS = 2

/** GET /api/v1/shipments: "Este endpoint recupera todos los envíos, paginados de diez en diez." */
export const SHIPMENTS_PAGE_SIZE = 10

/** GET /api/v1/shipments/carrier_services per_page: "Número de elementos por página (máx 20, por defecto 20)". */
export const CARRIER_SERVICES_MAX_PER_PAGE = 20

/**
 * Upper bound on carrier_services pages one listCarriers call walks, so a
 * `next_page` chain that never ends cannot loop. 50 × 20 = 1,000 services.
 */
export const CARRIER_SERVICES_MAX_PAGES = 50
