/**
 * Orderchamp supplier API constants.
 *
 * Docs: https://developers.orderchamp.com/
 */

export const GRAPHQL_ENDPOINT = 'https://api.orderchamp.com/v1/graphql'

/**
 * Orderchamp's limiting is cost-based, not a fixed row ceiling: "An app is
 * given a bucket of 1000 cost points, with a leak rate of 50 cost points per
 * second... A single query to the GraphQL API cannot exceed a cost of
 * 1000." (docs "Rate limits"). There is no documented row-count cap, so
 * these are conservative choices that keep one page's cost well under the
 * single-query ceiling rather than a platform-stated limit.
 */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/** The exact GraphQL error message Orderchamp returns when the rate-limit bucket is empty. */
export const THROTTLED_ERROR_MESSAGE = 'Throttled'
