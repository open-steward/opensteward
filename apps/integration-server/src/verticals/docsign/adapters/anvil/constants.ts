/**
 * Anvil (useanvil.com) GraphQL API constants.
 *
 * Anvil exposes a single GraphQL endpoint for both the development and
 * production environments — which environment a request hits is decided
 * entirely by the API key used (every Anvil organization ships with one dev
 * key and one prod key). Development-key requests are rate-limited more
 * aggressively and watermark generated PDFs; there is no separate sandbox
 * host. Auth is HTTP Basic with the API key as the username and an empty
 * password.
 *
 * Docs: https://www.useanvil.com/docs/api/graphql/
 */
export const GRAPHQL_URL = 'https://graphql.useanvil.com'

/** `organization.etchPackets` is page+limit paginated (1-indexed pages). */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
