/**
 * Megaplan API v3 constants.
 *
 * Every Megaplan account lives at its own host (https://<account>.megaplan.ru),
 * so only the path prefix is fixed here; the client joins it to the
 * connection's `credentials.extra.baseUrl`.
 *
 * Docs: https://dev.megaplan.ru/apiv3/index.html
 */

/** "Все ресурсы APIv3 доступны по URLs с префиксом /api/v3/". */
export const API_PREFIX = '/api/v3'

/** Token exchange endpoint (relative to baseUrl): "POST /api/v3/auth/access_token". */
export const AUTH_TOKEN_PATH = '/api/v3/auth/access_token'

/**
 * The page size sent when the caller gives none: "limit указание макисмального
 * количества сущностей в ответе. По умолчанию равен 100." No maximum is
 * documented, so a caller's limit is sent as asked and nothing is declared as
 * a cap.
 */
export const DEFAULT_PAGE_SIZE = 100
