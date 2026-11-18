/**
 * sproof Sign REST API constants.
 *
 * Spec: https://sign.sproof.com/api/v1/documentation/json (OpenAPI 3.0.3,
 * version 3.0.8). `servers[0].url` is "https://sign.sproof.com/api/v1", and
 * every operation authenticates with a `token` query parameter: "Token for
 * authentication (e.g. your API key)".
 */
export const API_BASE_URL = 'https://sign.sproof.com/api/v1'

/** GET /documents `perPage`: "Number of entries per page", default 10. No maximum is documented. */
export const DEFAULT_PAGE_SIZE = 10

export const DEFAULT_SCOPES: string[] = []
