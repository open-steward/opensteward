/**
 * Spiro API constants.
 *
 * Docs: https://developers.spiro.ai (Redoc over
 * https://developers.spiro.ai/api/docs/v1/openapi.json)
 */

/**
 * REST host. The spec's own examples: "Example: `GET
 * https://api.spiro.ai/api/v1/contacts?filter[first_name_eq]=John`".
 * engine.spiro.ai is the OAuth host only; its /api/v1/* answers 422
 * "Invalid Version" (the mobile-app gate) before looking at the token.
 */
export const SPIRO_BASE_URL = 'https://api.spiro.ai'

/** OAuth 2.0 — authorization code grant */
export const SPIRO_AUTH_URL = 'https://engine.spiro.ai/oauth/authorize'
/**
 * "To refresh your access token, execute a POST request to `POST
 * https://engine.spiro.ai/oauth/token`".
 */
export const SPIRO_TOKEN_URL = 'https://engine.spiro.ai/oauth/token'

/**
 * JSON:API media type. "Each request must be accompanied by the following
 * headers: `Accept application/vnd.api+json` `Authorization Bearer [YOUR
 * TOKEN]` `Content-type application/vnd.api+json`".
 */
export const SPIRO_MEDIA_TYPE = 'application/vnd.api+json'

/**
 * The only scope Spiro documents: "set `Scopes` to `admin`" ... "The issued
 * token grants full access to your entire organization. No finer-grained
 * scopes are available at this time."
 */
export const DEFAULT_SPIRO_SCOPES: readonly string[] = ['admin']
