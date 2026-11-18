/**
 * Visma Sign REST API v1 constants (https://sign.visma.net/api/docs/v1/).
 *
 * Origin from the documented responses ("Location:
 * https://sign.visma.net/api/v1/document/e59c…") and the first-party example
 * client (https://gitlab.com/vismasign/vismasign-api-examples,
 * v1/node/example.js: `const baseUrl = "https://sign.visma.net/";`).
 * Paths, including the `/api/v1` prefix, are what the request signs as
 * `http_path` ("'/api/v1/document/?foo=bar'").
 */
export const API_ORIGIN = 'https://sign.visma.net'
export const API_PATH_PREFIX = '/api/v1'

export const DEFAULT_PAGE_SIZE = 100
