// MyUnisoft uses API key + JWT authentication, not standard OAuth2.
// Partners obtain a permanent X-Third-Party-Secret from MyUnisoft support.
// Firm-scoped JWT tokens are obtained via the partner API login endpoint.
export const MYUNISOFT_API_BASE = 'https://api.myunisoft.fr/api/v1'
export const MYUNISOFT_TOKEN_URL = 'https://api.myunisoft.fr/api/v1/authentication/user'

// Rate limit: variable
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
