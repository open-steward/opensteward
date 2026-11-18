/**
 * SignEasy REST API constants.
 *
 * Docs: https://docs.signeasy.com
 */
// OpenAPI `servers`: [{ "url": "https://api.signeasy.com/v3" }]
export const API_BASE_URL = 'https://api.signeasy.com/v3'
export const OAUTH_AUTHORIZE_URL = 'https://signeasy.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://api.signeasy.com/oauth/token'

/**
 * Documented scopes (https://docs.signeasy.com/docs/scopes.md) for what the
 * adapter calls:
 * - `rs:read`: "Grants access to all the pending signature requests of the user."
 * - `signed:read`: "Grants read access to all signed documents of the user."
 *   (GET /rs/envelope/signed/, part of listEnvelopes)
 * - `rs:update`: "Grants access to actions like remind and void for all
 *   signature requests of the user." (voidEnvelope)
 * - `template:manage`: "Grants read, list, rename and delete access to all the
 *   templates of the user." (the only template scope)
 * - `offline_access`: "you must include this scope to receive the
 *   `refresh_token` along with the `access_token`."
 */
export const DEFAULT_SCOPES = ['rs:read', 'signed:read', 'rs:update', 'template:manage', 'offline_access']
