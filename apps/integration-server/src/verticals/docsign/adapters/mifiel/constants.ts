/**
 * Servers of the API reference (https://docs.mifiel.com/en/api.json):
 *   "servers": [{ "url": "https://app.mifiel.com" }, { "url": "https://app-sandbox.mifiel.com" }]
 * Paths there carry their own `/api/...` prefix, so the base is the bare host.
 */
export const API_BASE_URL = 'https://app.mifiel.com'

/**
 * "El endpoint que utilizarás para solicitar los recursos es: /api/query"
 * (https://guia.mifiel.com/como-hacer-busquedas-avanzadas-api); the reference
 * lists it as `post` on `/api/query` ("Advanced information").
 */
export const QUERY_PATH = '/api/query'

/** QueryRequest.version: "Endpoint version, latest is 1.0.0". */
export const QUERY_VERSION = '1.0.0'
