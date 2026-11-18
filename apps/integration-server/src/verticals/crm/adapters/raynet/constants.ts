/**
 * Raynet CRM REST API v2 (https://app.raynetcrm.com/api/doc/index-en.html).
 *
 * The spec lists four servers: app.raynet.cz, app.raynetcrm.sk,
 * app.raynetcrm.com and eu.raynetcrm.com. The adapter has no region key, so
 * it uses the .com host; accounts on the other hosts cannot connect yet.
 */
export const BASE_URL = 'https://app.raynetcrm.com/api/v2'

/** Used only when a caller names no limit; the router always sends one. */
export const DEFAULT_PAGE_SIZE = 25

/** "The maximum page size is 1 000 items." (List pagination section.) */
export const MAX_PAGE_SIZE = 1000
