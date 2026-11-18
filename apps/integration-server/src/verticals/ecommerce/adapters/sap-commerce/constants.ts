/**
 * SAP Commerce Cloud (Hybris) OCC API constants.
 *
 * The OCC (Omni Commerce Connect) REST API is the standard storefront +
 * back-office API for SAP Commerce Cloud. Every request is scoped to a
 * `{baseSiteId}` embedded in the path:
 *   `https://{host}/occ/v2/{baseSiteId}/...`
 *
 * Auth: OAuth2 client_credentials or password grant against
 *   `https://{host}/authorizationserver/oauth/token`.
 *
 * Docs: https://help.sap.com/docs/SAP_COMMERCE
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** Consider a token "about to expire" this many ms before its real expiry. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Default base site when the caller does not specify one. */
export const DEFAULT_BASE_SITE = 'electronics'

/** Default catalog id. */
export const DEFAULT_CATALOG = 'electronicsProductCatalog'

/** Default catalog version. */
export const DEFAULT_CATALOG_VERSION = 'Online'

/** Default currency code. */
export const DEFAULT_CURRENCY = 'USD'
