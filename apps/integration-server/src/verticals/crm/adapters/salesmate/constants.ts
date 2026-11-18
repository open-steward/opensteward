/**
 * Salesmate v4 constants. Source: the first-party Postman collection behind
 * https://apidocs.salesmate.io/ (collection 7811505/S1ZucWTA).
 */

/**
 * "A maximum of **250** records will be fetched in one request." (Search
 * contacts; the same sentence is on Search a Company, Search a deal and
 * Search an activity.)
 */
export const MAX_PAGE_SIZE = 250

/**
 * Getting Started → Module Ids: "1 Contact", "2 Task", "4 Deal", "5 Company".
 * (The table's header row is transposed, but the pairs are unambiguous and
 * match the `moduleId` each documented search body sends.)
 */
export const MODULE_ID = {
  contact: 1,
  activity: 2,
  deal: 4,
  company: 5,
} as const

/** Hosts are `https://link_name.salesmate.io/…` in every documented request. */
export const HOST_SUFFIX = '.salesmate.io'
