/**
 * The API host. The collection's `{{baseurl}}` variable and every documented
 * request use it, e.g. "https://integration.upsales.com/api/v2/contacts/?token={{token}}"
 * (https://api.upsales.com/api/collections/4421023/RW87rVf1?segregateAuth=true&versionTag=latest).
 * api.upsales.com is the documentation site, not the API.
 */
export const BASE_URL = 'https://integration.upsales.com/api/v2'

/** "The default limit is set to 1000 and the maximum limit is 2000." (Pagination) */
export const DEFAULT_PAGE_SIZE = 1000
export const MAX_PAGE_SIZE = 2000
