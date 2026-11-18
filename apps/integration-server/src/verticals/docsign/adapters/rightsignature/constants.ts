/**
 * RightSignature REST API constants.
 *
 * RightSignature (Citrix RightSignature) uses standard OAuth2 authorization
 * -code grant on the app subdomain and a separate api subdomain for REST.
 *
 * Docs: https://rightsignature.com/api/documentation
 */
export const API_BASE_URL = 'https://api.rightsignature.com'

export const OAUTH_AUTHORIZE_URL = 'https://app.rightsignature.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://app.rightsignature.com/oauth/token'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Default RightSignature scopes. `documents:read documents:write` covers
 * the envelope/signer/document/history surface; `templates:read` covers
 * reusable forms.
 */
export const DEFAULT_SCOPES = ['documents:read', 'documents:write', 'templates:read']

/**
 * Documents resource, documented at
 * https://api.rightsignature.com/documentation/resources/v1/documents:
 *   show — "api_url":"/public/v1/documents/:id","http_method":"GET",
 *          "short_description":"Return data for a specific Document"
 * The API index (`"api_url":"/public/v1/"`) prefixes every resource with
 * `/public/v1`; the bare `/documents/...` paths above it return 404.
 */
export const DOCUMENTS_PATH = '/public/v1/documents'
