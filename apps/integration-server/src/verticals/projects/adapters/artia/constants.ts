/**
 * Artia API constants.
 *
 * Artia exposes a single GraphQL endpoint for all operations.
 * Authentication is a two-step flow: exchange clientId + secret for a
 * short-lived Bearer token (valid 1 hour) via the `authenticationByClient`
 * GraphQL mutation, then pass `Authorization: Bearer <token>` and
 * `OrganizationId` on every subsequent request.
 *
 * Rate limit: 100 requests/minute per IP. Exceeding it triggers a 1-hour
 * automatic IP block.
 *
 * Docs: https://ajuda.artia.com/pt/articles/12559-api
 * Postman: https://documenter.getpostman.com/view/10208526/TVCZaWK4
 */

export const GRAPHQL_URL = 'https://api.artia.com/graphql'
export const DEFAULT_PAGE_SIZE = 100
export const TOKEN_HELP_URL = 'https://ajuda.artia.com/pt/articles/12559-api'
