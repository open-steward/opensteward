export const INVOICED_API_BASE = 'https://api.invoiced.com'
export const INVOICED_SANDBOX_API_BASE = 'https://api.sandbox.invoiced.com'

// Invoiced uses HTTP Basic Auth: API key as username, empty password.
// Basic-auth header value: base64(<apiKey>:)

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500
