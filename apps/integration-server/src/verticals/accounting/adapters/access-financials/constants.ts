/**
 * Access Financials GraphQL API constants.
 *
 * Documentation: https://developer.erp.accessacloud.com/docs/financials/overview
 *
 * Auth: Bearer access token + Ocp-Apim-Subscription-Key header.
 * Tokens are long-lived (up to 365 days) and regenerated via ERP Subscription Manager.
 * No standard OAuth2 authorization-code flow is provided.
 *
 * Pagination: cursor-based, 100 records per page.
 * `hasNextPage` / `endCursor` appear in `pageInfo` on every collection result.
 */

export const AF_GRAPHQL_URL = 'https://api.erp.accessacloud.com/financials-graphql'

// Rate limit is not publicly documented; conservative default.
export const RATE_LIMIT_RPM = 60
export const DEFAULT_PAGE_SIZE = 100
/**
 * Rows in one upstream page. The Queries page documents paging once for the
 * whole API: "The page size is set to 100."
 * (https://developer.erp.accessacloud.com/docs/financials/operations-types/queries)
 * The customer and supplier record pages say the same of master records:
 * "This API endpoint returns 100 records per page."
 *
 * Connections also take `first: Int`, but first-party prose describes it
 * only on transaction connections. The schema's own text for it is the
 * GraphQL.NET boilerplate. So a list asks for exactly this size, and cuts
 * the caller's rows out of the pages it gets back. It never relies on a
 * smaller `first` being honoured.
 */
export const UPSTREAM_PAGE_SIZE = 100
