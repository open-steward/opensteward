/**
 * Packeta (Zásilkovna) API constants.
 *
 * Packeta exposes a SOAP/REST API using their own XML envelope format.
 * The primary REST endpoint accepts POST requests with an XML body and
 * returns XML or JSON depending on the method.
 *
 * Reference: https://docs.packeta.com/docs/introduction
 */

/** REST API endpoint — all method calls are POST requests to this URL. */
export const PACKETA_API_BASE = 'https://www.zasilkovna.cz/api/rest'

/**
 * Base of Packeta's v5 JSON feeds, keyed by the account's API key:
 * "https://pickup-point.api.packeta.com/v5/__API_KEY__/carrier/json?lang=__LANGUAGE__"
 * (https://docs.packeta.com/docs/home-delivery/carriers).
 */
export const PACKETA_FEED_API_BASE = 'https://pickup-point.api.packeta.com/v5'

/** Tracking portal URL template — append `?id=<barcode>` */
export const PACKETA_TRACKING_URL = 'https://tracking.packeta.com/en'

/** Dashboard / API credentials page */
export const PACKETA_DASHBOARD_URL = 'https://client.packeta.com/en/administration/api'
