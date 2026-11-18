/**
 * Production URI base plus the API version. "Producción , URI base:
 * https://api.openpay.mx" and "Un endpoint completo esta formado por la URI
 * base del ambiente, el identificador del comercio y el recurso."
 * (https://documents.openpay.mx/docs/api/index.html) — the merchant id is
 * appended per connection by the client.
 */
export const API_BASE_URL = 'https://api.openpay.mx/v1'
/** Sent as `limit` when the caller names none; Openpay's own default is 10. */
export const DEFAULT_PAGE_SIZE = 50
