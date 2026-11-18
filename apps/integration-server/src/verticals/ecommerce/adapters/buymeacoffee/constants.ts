/**
 * Buy Me a Coffee API constants.
 *
 * Buy Me a Coffee is a creator monetization platform. Creators receive
 * one-time tips ("coffees"), recurring memberships, and sell digital shop
 * items ("extras").
 *
 * Auth: Personal access token (long-lived Bearer token obtained from
 * Settings → API in the Buy Me a Coffee dashboard). No OAuth2 flow.
 *  - `accessToken` = Buy Me a Coffee personal access token
 *
 * API surface: REST API at developers.buymeacoffee.com/api/v1.
 * Pagination uses `page` query param. All list responses share a common
 * envelope: `{ data: [...], current_page, last_page, per_page, total }`.
 *
 * Slug: `buymeacoffee` (both directory and platform identifier).
 */

/** Buy Me a Coffee REST API v1 base URL. */
export const BASE_URL = 'https://developers.buymeacoffee.com/api/v1'

/** Default currency when a Buy Me a Coffee response omits the field. */
export const DEFAULT_CURRENCY = 'USD'

/** Default page number for paginated requests. */
export const DEFAULT_PAGE = 1
