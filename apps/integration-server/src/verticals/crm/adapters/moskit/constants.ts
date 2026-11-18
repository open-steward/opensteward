/**
 * "Todas as requisições para a API v2 deverão ser enviadas para a URL base
 * `https://api.ms.prod.ollow.services/v2`." — Considerações iniciais,
 * https://stoplight.io/api/v1/projects/cHJqOjcwNDY/nodes/6a456d10b1b93
 * (Moskit is now Ollow; developers.moskitcrm.com redirects to these docs).
 */
export const BASE_URL = 'https://api.ms.prod.ollow.services/v2'

/**
 * "quantity | Quantidade de registros para receber da busca | 10 | 50" —
 * default 10, maximum 50. Paginação e ordenação,
 * https://stoplight.io/api/v1/projects/cHJqOjcwNDY/nodes/a0ad669547adb
 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50

/** "X-Ollow-Listing-Total | Número total de resultados encontrados para esta busca" (same article). */
export const TOTAL_HEADER = 'X-Ollow-Listing-Total'
