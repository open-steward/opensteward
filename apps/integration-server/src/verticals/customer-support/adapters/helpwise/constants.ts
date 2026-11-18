/**
 * Helpwise REST API constants.
 *
 * Source: Helpwise's first-party API collection
 * (https://documenter.getpostman.com/view/29744652/2s9YC5yYKf; helpwise.io/developers
 * redirects there). Its collection variable is
 * `baseUrl = "https://apis.helpwise.io"`, the host of every V1 request, and
 * its auth section reads: "You must include an API key and API Secret in each
 * request ... with the Basic auth header `Basic BASE_64(API_KEY:API_SECRET)`".
 * "The limit is 100 requests per minute."
 *
 * The V0 API (https://app.helpwise.io/dev-apis/...) is not used: every method
 * this adapter keeps has a V1 route.
 */
export const API_BASE_URL = 'https://apis.helpwise.io'
