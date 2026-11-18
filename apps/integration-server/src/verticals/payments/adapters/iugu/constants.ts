export const API_BASE_URL = 'https://api.iugu.com/v1'
export const DEFAULT_PAGE_SIZE = 50
/**
 * "Limita o número de registros retornados em até 100" (listar-cliente,
 * listar-faturas, listar-assinaturas). /plans allows 1,000; 100 is safe there.
 */
export const MAX_PAGE_SIZE = 100
