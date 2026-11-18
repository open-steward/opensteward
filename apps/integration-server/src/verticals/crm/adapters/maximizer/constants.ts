/**
 * Octopus API (Maximizer.Web.Data) cloud base URL.
 *
 * https://developer.maximizer.com/reference/octopus-api-docs-read-query-syntax-scope
 * "// POST https://api.maximizer.com/octopus/Read"
 *
 * The first-party Postman environment "Octopus API (cloud, api.maximizer.com)"
 * (github.com/maximizercrm/octopus-api) sets BaseURL to the same value. An
 * on-premise install has its own BaseURL, read from credentials.extra.instanceUrl.
 */
export const DEFAULT_BASE_URL = 'https://api.maximizer.com/octopus'
export const DEFAULT_PAGE_SIZE = 25
