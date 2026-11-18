/**
 * Erplain GraphQL API constants (the v2 "New Erplain API").
 *
 * https://erplain.readme.io/v2.0/reference/setup:
 *   "GraphQL (and therefore our API) only uses **one** endpoint:
 *    **<https://api.erplain.app/graphql>**"
 *   "You will then receive a **bearer token**."
 *
 * https://erplain.readme.io/v2.0/reference/pagination:
 *   | page  | Page number                 | int  | 1             |
 *   | first | Number of results to return | int  | 50 (max: 250) |
 */
export const GRAPHQL_URL = 'https://api.erplain.app/graphql'
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250
