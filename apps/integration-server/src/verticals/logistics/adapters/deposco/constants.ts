/**
 * Deposco API constants.
 *
 * First-party reference: the Deposco API OpenAPI document served at
 * https://auth.deposco.com/public/spec?version=latest (the file
 * developer.deposco.com renders; "Deposco API" 2.0.2623-19).
 *
 * servers:
 *   - url: https://api.deposco.com/latest
 *     description: Production API - North American Region
 *   - url: https://api.eu.deposco.com/latest
 *     description: Production API - EU and UK Region
 *
 * "Starting with version 2.0 of the API, the access token in the request is
 * used to direct the request to a specific environment." There is no tenant
 * path segment. The adapter has no region key, so it uses the North American
 * host; EU/UK tenants are a recorded gap.
 */

export const DEPOSCO_API_BASE = 'https://api.deposco.com/latest'

/**
 * OAuth 2.0 token endpoint (`components.securitySchemes.oauth2.flows.
 * authorizationCode.tokenUrl` and the "Request an access token" example).
 */
export const DEPOSCO_TOKEN_URL = 'https://auth.deposco.com/oauth2/token'

/** Developer portal, where an application's client ID, secret and each installation's refresh token are shown. */
export const DEPOSCO_DASHBOARD_URL = 'https://developer.deposco.com'

/**
 * "The access token that is returned is valid for one hour." Used only when
 * the token response carries no `expires_in`.
 */
export const DEPOSCO_ACCESS_TOKEN_TTL_SECONDS = 60 * 60

/**
 * Refresh the access token when it has fewer than this many milliseconds left
 * before expiry.
 */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/**
 * `pageSize` on GET /shipments/outboundShipments and GET /facilities:
 * `{ type: integer, default: 50, maximum: 100, minimum: 1 }`.
 */
export const DEPOSCO_MAX_PAGE_SIZE = 100
export const DEPOSCO_DEFAULT_PAGE_SIZE = 50

/**
 * `pageSize` on GET /orders/customerOrders:
 * `{ type: integer, default: 25, maximum: 50, minimum: 1 }`.
 */
export const DEPOSCO_CUSTOMER_ORDERS_MAX_PAGE_SIZE = 50
export const DEPOSCO_CUSTOMER_ORDERS_DEFAULT_PAGE_SIZE = 25
