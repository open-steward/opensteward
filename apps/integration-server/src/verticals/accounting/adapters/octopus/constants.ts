/**
 * Octopus REST API constants.
 *
 * The Octopus Webservice is developed and maintained by Inaras NV (Belgium).
 * Docs: https://login.octopus.be/manual/NL/manual-api.htm
 * Swagger: https://service.inaras.be/octopus-rest-api/swagger/
 *
 * Authentication uses a two-step approach:
 *   1. Authenticate with credentials → access token (10-minute TTL)
 *   2. POST that token + dossierId → dossier token (used for all data calls)
 *
 * For the api_key adapter auth model the caller stores the dossier token
 * directly as credentials.accessToken and passes it as a Bearer header.
 */

export const OCTOPUS_API_BASE = 'https://service.inaras.be/octopus-rest-api/api/'
export const OCTOPUS_OAUTH_AUTHORIZE = 'https://service.inaras.be/octopus-oauth/authorize'
export const OCTOPUS_OAUTH_TOKEN = 'https://service.inaras.be/octopus-oauth/token'

// Rate limits are not officially published; be conservative.
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
