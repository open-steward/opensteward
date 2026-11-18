/**
 * ZenHub GraphQL API constants.
 *
 * ZenHub is single-host SaaS. All requests are POST to the GraphQL endpoint
 * at `https://api.zenhub.com/public/graphql`, authenticated with a Personal
 * API Key in the `Authorization: Bearer <key>` header. Keys are minted from
 * the ZenHub Dashboard (API section) — no OAuth2 authorization-code flow is
 * provided for first-party access.
 *
 * Docs: https://developers.zenhub.com/graphql-api-docs/getting-started/
 * REST (deprecated): https://github.com/ZenHubIO/API
 */

/** ZenHub public GraphQL endpoint. */
export const GRAPHQL_URL = 'https://api.zenhub.com/public/graphql'

/**
 * Where a user mints a Personal API Key (ZenHub Dashboard → API).
 * Shown in the Connect Link form help text.
 */
export const TOKEN_HELP_URL = 'https://app.zenhub.com/dashboard'

/**
 * Relay cursor-based pagination — maximum page size is 100 per the API docs.
 */
export const DEFAULT_PAGE_SIZE = 100
