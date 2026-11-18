/**
 * ChurnZero REST API constants.
 *
 * The REST API is an OData v4 implementation hosted on the customer's
 * per-instance subdomain. Base URL pattern:
 *   https://{instance}.us1app.churnzero.net/public/v1
 *
 * Auth: HTTP Basic — Authorization: Basic <base64(username:apikey)>
 *
 * Docs: https://app.churnzero.net/developers
 */

/** Default OData page size for list requests (ChurnZero default is 100). */
export const DEFAULT_PAGE_SIZE = 100

/** Fallback base URL shown in examples. Operators must supply their real instance URL. */
export const EXAMPLE_BASE_URL = 'https://marketingpony.us1app.churnzero.net/public/v1'

/** OData key used to detect the next page of results. */
export const ODATA_NEXT_LINK = '@odata.nextLink'
