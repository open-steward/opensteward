/**
 * Loja Integrada REST API constants.
 *
 * Source: Loja Integrada's own OpenAPI 3.1.0 specification,
 * https://api-docs.lojaintegrada.com.br/openapi/API-Loja-Integrada.json
 * (linked from https://api-docs.lojaintegrada.com.br/configuration.json).
 */

/** `servers[0].url`: "https://api.awsli.com.br". */
export const BASE_URL = 'https://api.awsli.com.br'

/**
 * The page size used when a caller names none. Every documented list answer
 * shows `"limit": 20` in its `meta` block (e.g. GET /v1/produto:
 * `"next": "/api/v1/produto?limit=20&offset=20"`).
 */
export const DEFAULT_PAGE_SIZE = 20

/**
 * GET /v1/pedido/search: "**limit**: indica a quantidade de pedidos por página
 * (o máximo aceito é 50)". The only page-size maximum the specification
 * states; it applies to that endpoint alone.
 */
export const ORDER_SEARCH_MAX_LIMIT = 50
