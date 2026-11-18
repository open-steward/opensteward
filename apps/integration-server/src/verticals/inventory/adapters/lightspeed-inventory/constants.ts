/**
 * Lightspeed Retail (X-Series) API constants.
 *
 * Base URL is per-store: https://{domain_prefix}.retail.lightspeed.app/api/2.0
 * The domain_prefix is returned as part of the OAuth token response and stored
 * in credentials.extra.domainPrefix.
 *
 * OAuth2 endpoints:
 *   Authorize : https://secure.retail.lightspeed.app/connect
 *   Token     : https://{domain_prefix}.retail.lightspeed.app/api/1.0/token
 */
export const OAUTH_AUTHORIZE_URL = 'https://secure.retail.lightspeed.app/connect'
export const API_VERSION = '2.0'
/**
 * API 2.0 page sizes, from "Syncing an Entity to an External System"
 * (https://x-series-api.lightspeedhq.com/v1.0/docs/sync_entity_to_external_system.md):
 *
 *   "the results are returned with a default pagination size of 200, i.e. not
 *    more than 200 results will be returned at a time"
 *   "You may be very tempted to just increase the page size to get all the
 *    records but we do not recommend this for this two reasons. One is that
 *    you may hit issues with timeouts and secondly, some queries are limited"
 *
 * No hard maximum is documented, so 200 is both the size a call without a
 * limit sends and the most any call sends: the adapter's `maxPageSize`.
 */
export const DEFAULT_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 200
export const SCOPES_DEFAULT = [
  'products:read',
  'inventory:read',
  'outlets:read',
  'suppliers:read',
  'consignments:read',
].join(' ')
