/**
 * GEODIS Americas WMS API, from the first-party Postman collection
 * (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw?segregateAuth=true&versionTag=latest):
 *
 *   "All the API calls for QA start with "https://apigw-qa.ams.geodis.com" and
 *    for prod, it will be "https://apigw.ams.geodis.com""
 *
 * The adapter has no environment key, so it uses production.
 */
export const GEODIS_API_BASE = 'https://apigw.ams.geodis.com/'

/**
 * GenerateToken: `POST https://auth.ams.geodis.com/realms/sso/protocol/openid-connect/token`
 * with basic auth (username, password) and the urlencoded body
 * `grant_type=client_credentials`. "This API provides you a new Oauth2 client
 * credential access token." The example answer has `"expires_in": 300`.
 */
export const GEODIS_TOKEN_URL =
  'https://auth.ams.geodis.com/realms/sso/protocol/openid-connect/token'

export const GEODIS_DASHBOARD_URL = 'https://www.geodis.com/'

export const RATE_LIMIT_RPS = 10

/** Mint a new token this long before the current one expires. */
export const TOKEN_REFRESH_BUFFER_MS = 30_000

/**
 * GetShipmentConfirmation `pageSize`: "Page size is number of pages viewable
 * per page; Optional; Default 100; Minimum User Setting 100; Maximum User
 * Setting 1000;". Rows are re-cut to the caller's page by `pageByRows`, so
 * the adapter always asks for the documented maximum.
 */
export const SHIPMENT_CONFIRMATION_PAGE_SIZE = 1000

/**
 * GetShipmentConfirmation: "Difference between dates cannot exceed 96 hours,
 * or beyond 45 days from current date."
 */
export const SHIPMENT_CONFIRMATION_WINDOW_DAYS = 4
export const SHIPMENT_CONFIRMATION_LOOKBACK_DAYS = 45
