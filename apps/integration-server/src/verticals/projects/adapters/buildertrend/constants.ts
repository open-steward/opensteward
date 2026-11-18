// Buildertrend partner REST API.
// Production host is api.buildertrend.net; the partner sandbox mirrors it under
// api.sandbox.buildertrend.net. Both expose the same versioned `/v1` surface.
export const API_BASE_URL = 'https://api.buildertrend.net/v1'
export const API_SANDBOX_BASE_URL = 'https://api.sandbox.buildertrend.net/v1'

// OAuth2 authorization-code flow. Users authorize on the Buildertrend web app;
// the token is minted by the API host.
export const OAUTH_AUTHORIZE_URL = 'https://buildertrend.net/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://api.buildertrend.net/oauth/token'

// Buildertrend paginates with 1-based page numbers and a `pageSize` cap of 100.
export const DEFAULT_PAGE_SIZE = 100

// Read-only scopes for the projects vertical.
export const DEFAULT_SCOPES = ['jobs.read', 'schedule.read', 'todos.read', 'users.read']
