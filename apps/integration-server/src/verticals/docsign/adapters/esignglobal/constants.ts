/**
 * eSignGlobal (eSign.AI) REST API constants.
 *
 * eSignGlobal runs out of three regional production data centres plus a
 * sandbox ("SML") environment. The customer picks the data centre that
 * matches the region their eSignGlobal account is hosted in; the resolved
 * host is stored on `credentials.extra.baseUrl` so the client can read it.
 *
 * All resource paths nest under `/esignglobal/v1/...`. The access token is
 * obtained from the OAuth2 token endpoint (client_credentials grant) and
 * presented as `Authorization: Bearer <token>` on every request.
 *
 * Docs: https://www.esign.ai/en-US/developer-center/api
 */

/** API path prefix shared by every endpoint. */
export const API_PATH_PREFIX = '/esignglobal/v1'

/** Sandbox ("SML") API host. */
export const SANDBOX_BASE_URL = 'https://openapi-sml.esignglobal.com'

/** Production data-centre hosts, keyed by region. */
export const PRODUCTION_BASE_URLS = {
  /** Hong Kong data centre. */
  hk: 'https://openapi-as1.esignglobal.com',
  /** Singapore data centre. */
  sg: 'https://openapi-as2.esignglobal.com',
  /** EU (Frankfurt) data centre. */
  eu: 'https://openapi-eu1.esignglobal.com',
} as const

export type EsignglobalRegion = keyof typeof PRODUCTION_BASE_URLS

/** Default host when none resolved on the credentials. */
export const DEFAULT_BASE_URL = PRODUCTION_BASE_URLS.hk

/** OAuth2 token endpoint path (client_credentials grant). */
export const ACCESS_TOKEN_PATH = `${API_PATH_PREFIX}/oauth2/accessToken`

/**
 * Template list pagination. eSignGlobal caps `pageSize` at 20 and defaults
 * to 20 when omitted.
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 20

/** A successful eSignGlobal response carries `code: "0"`. */
export const SUCCESS_CODE = '0'
