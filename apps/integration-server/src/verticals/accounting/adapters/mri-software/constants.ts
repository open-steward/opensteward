/**
 * MRI Software REST API constants.
 *
 * MRI Software is an enterprise real-estate accounting platform with
 * per-tenant deployments. OAuth2 endpoints and the API base path are
 * relative to the customer's `instanceUrl` (stored in credentials.extra).
 *
 * OAuth2: standard authorization-code flow (PKCE optional).
 * Docs: https://www.mrisoftware.com/products/mri-information-exchange/
 */

// OAuth2 paths — appended to `instanceUrl` at runtime
export const MRI_AUTH_PATH = '/connect/authorize'
export const MRI_TOKEN_PATH = '/connect/token'

// REST API path prefix — appended to `instanceUrl` at runtime
export const MRI_API_PATH = '/api/accounting/v1/'

// Pagination: OData-style $top / $skip parameters
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

// Default OAuth2 scopes for accounting access
export const DEFAULT_SCOPES = ['openid', 'profile', 'accounting.read', 'accounting.write']
