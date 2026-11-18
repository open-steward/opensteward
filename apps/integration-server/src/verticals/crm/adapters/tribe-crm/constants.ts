/**
 * Tribe CRM API constants.
 *
 * REST base URL: https://api.tribecrm.nl/v1/odata
 * OAuth2 token endpoint: https://auth.tribecrm.nl/oauth2/token
 *
 * The API exposes an OData v4 feed over REST. Every request must carry a
 * Bearer access token in the Authorization header.  Pagination uses the
 * standard OData $top / $skip query parameters.
 */

/** Production OData base URL (no trailing slash). */
export const BASE_URL = 'https://api.tribecrm.nl/v1/odata'

/** OAuth2 client-credentials token endpoint. */
export const TOKEN_URL = 'https://auth.tribecrm.nl/oauth2/token'

/** Default page size used by list calls. */
export const DEFAULT_PAGE_SIZE = 25

// ── OData entity-set paths ───────────────────────────────────────────────────

/** Individual person / contact records. */
export const PATH_RELATIONS = '/Relation'

/** Organisation (company / account) records. */
export const PATH_ORGANISATIONS = '/Organisation'

/** Sales-opportunity (deal) records. */
export const PATH_OPPORTUNITIES = '/Activity_SalesOpportunity'

/** Task / appointment (activity) records. */
export const PATH_TASKS = '/Activity_Task'

/** Note records attached to relations or opportunities. */
export const PATH_NOTES = '/Activity_Note'
