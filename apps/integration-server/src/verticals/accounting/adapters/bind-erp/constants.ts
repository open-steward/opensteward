// Bind ERP API – https://developers.bind.com.mx
// OpenAPI spec version: v1.2

export const BIND_ERP_API_BASE = 'http://api.bind.com.mx'

// Auth: API Key in request header named `apiKey`
export const BIND_ERP_AUTH_HEADER = 'apiKey'

// OData-style pagination – $top / $skip
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

// Rate limits (from developer docs)
// Registered users: 300 req / 5 min, 10 000 req / 24 h
export const RATE_LIMIT_RPM = 300
