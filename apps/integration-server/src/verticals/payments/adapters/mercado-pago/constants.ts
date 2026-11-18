export const API_BASE_URL = 'https://api.mercadopago.com'
export const DEFAULT_PAGE_SIZE = 50
/** /v1/payments/search: limit "Number of results shown (max value = 50)." */
export const PAYMENTS_SEARCH_MAX_LIMIT = 50
/**
 * /v1/payments/search: offset "Position from which you want the results to be
 * returned. By default, the value is 0 (max. allowed: 10000)."
 */
export const PAYMENTS_SEARCH_MAX_OFFSET = 10000
/**
 * The seller lookup behind X-Caller-Id. Mercado Pago's credentials guide
 * sends an access token here: "if you perform a **GET** request to the
 * `/users/me` resource, it would be like this: curl -H 'Authorization: Bearer
 * {{YOUR_ACCESS_TOKEN}}' https://api.mercadolibre.com/users/me"
 * (https://www.mercadopago.com.br/developers/en/docs/checkout-api-payments/additional-content/your-integrations/credentials.md).
 * It is on api.mercadolibre.com, not API_BASE_URL; an absolute URL overrides
 * the axios baseURL.
 */
export const USERS_ME_URL = 'https://api.mercadolibre.com/users/me'
