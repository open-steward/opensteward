/**
 * eSignly REST API constants.
 *
 * eSignly exposes a single hosted REST API under `https://acc.esignly.com/v1/`.
 * Authentication is a static `api_key` submitted as a request parameter (the
 * documented `createSignRequest` example posts it as `multipart/form-data`);
 * there is no OAuth flow and no per-account base URL. The same key is used for
 * both sandbox and production accounts — the tier is determined by the key,
 * not by the host.
 *
 * Docs: https://www.esignly.com/esignly-api.html
 */
export const API_BASE_URL = 'https://acc.esignly.com/v1'

/** Request parameter name carrying the API key on every call. */
export const API_KEY_PARAM = 'api_key'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
