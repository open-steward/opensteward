/**
 * Mintsoft WMS REST API constants.
 *
 * Auth: API key obtained via POST /api/Auth (username+password) or a
 * long-lived static key.  Every request carries the key in the
 * `ms-apikey` header.  Dynamic keys expire after 24 hours.
 */
export const API_BASE_URL = 'https://api.mintsoft.co.uk'
export const DEFAULT_PAGE_SIZE = 100
/** GET /api/ASN/List Limit: "Number of Result to be returned - Default 100 - Max 100". */
export const ASN_LIST_MAX_PAGE_SIZE = 100
