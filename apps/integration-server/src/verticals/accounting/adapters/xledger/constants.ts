// Xledger uses a GraphQL API with API token authentication — not OAuth2.
// Tokens are generated in Administration > System Access > GraphQL > API Tokens.
// Use "token <hash>" as the Authorization header value.
export const XLEDGER_GRAPHQL_URL = 'https://www.xledger.net/graphql'

// Rate limit: credit-based (mass mutations cost fewer credits)
export const MAX_NODES_PER_REQUEST = 500
export const DEFAULT_PAGE_SIZE = 50
