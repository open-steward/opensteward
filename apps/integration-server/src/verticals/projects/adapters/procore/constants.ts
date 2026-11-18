// Procore REST API. Resource versions are encoded per-endpoint as
// /rest/v{major}.{resource}; v1.0 is the stable default used here.
export const API_BASE_URL = 'https://api.procore.com/rest/v1.0'
export const OAUTH_AUTHORIZE_URL = 'https://login.procore.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://login.procore.com/oauth/token'

// Procore paginates with `page` (1-based) + `per_page`; the `Link` header's
// rel="next" is omitted on the last page. "We recommend keeping `per_page` at
// or below **2,000**." (https://developers.procore.com/documentation/pagination)
// That recommendation is the ceiling a direct call is clamped to; the router
// already caps a request's limit well below it.
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
export const MAX_PER_PAGE = 2000

// Procore scopes are configured at the OAuth application level rather than
// requested per-authorization, so the scope param is sent empty by default.
export const DEFAULT_SCOPES: string[] = []
