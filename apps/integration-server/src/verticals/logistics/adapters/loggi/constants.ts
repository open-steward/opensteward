/**
 * Loggi API constants.
 *
 * Every OpenAPI definition embedded in https://docs.api.loggi.com/reference
 * lists two servers:
 *
 *   "servers": [ { "url": "https://stg.api.loggi.com" }, { "url": "https://api.loggi.com" } ]
 *
 * `stg.` is the staging host. Connections carry production tokens, so the
 * adapter talks to the production host.
 *
 * Authentication: "O campo idToken deve ser informado no Header Authorization
 * de cada requisição às APIs da Loggi" (reference/authenticatev1). The
 * adapter stores a pre-issued idToken; see auth.ts.
 */

export const LOGGI_API_BASE = 'https://api.loggi.com/'

/** Loggi developer / API-key management portal. */
export const LOGGI_DASHBOARD_URL = 'https://app.loggi.com/configuracoes/api'
