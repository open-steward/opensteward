/**
 * e-Signature.eu REST API constants.
 *
 * eIDAS electronic-signature provider (QES / AES / SES) exposed as a
 * WordPress-hosted JSON API. Single environment — there is no separate
 * sandbox host; test requests run against the same base URL with a
 * test API key.
 *
 * Auth: per-request `x-api-key` header plus a `userid` query parameter
 * (both issued in the dashboard under Settings > API). No interactive
 * OAuth flow.
 *
 * Docs: https://www.e-signature.eu/en/api-electronic-signature/
 *       https://documenter.getpostman.com/view/10230512/2sBXirkUa9
 */
export const API_BASE_URL = 'https://www.e-signature.eu/wp-json/signature'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES: string[] = []
