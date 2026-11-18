/**
 * Sana Commerce web service constants.
 *
 * Sana Commerce exposes a WCF-based REST/JSON web service under
 * `{storefront_url}/api/CommerceService.svc`. The storefront URL is
 * per-instance (on-premise or cloud-hosted), so there is no single global
 * base URL — callers supply it via credentials.extra.siteUrl.
 *
 * The service authenticates via a session ticket obtained by calling
 * `customer/login`. That ticket is placed in the `Ticket` HTTP header on
 * subsequent requests.
 *
 * Docs: https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/
 */

/** Default number of items to request per page. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size accepted by the Sana Commerce web service. */
export const MAX_PAGE_SIZE = 100

/** URL path prefix for the Sana Commerce web service. */
export const WS_PATH = '/api/CommerceService.svc'
