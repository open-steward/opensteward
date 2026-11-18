/**
 * The Yoco API (https://developer.yoco.com/docs/api/using-the-rest-api.md):
 * "The **live** environment is accessible at `https://api.yoco.com`."
 *
 * Not the Checkout API host (`https://payments.yoco.com`), whose first-party
 * spec (https://developer.yoco.com/openapi/checkout-api-reference.json) has
 * only `/api/checkouts`, `/api/checkouts/{id}/refund` and `/api/webhooks`.
 * The sandbox (`https://api.yocosandbox.com`) is not selectable: the adapter
 * has no environment key.
 */
export const API_BASE_URL = 'https://api.yoco.com'

/**
 * Every Yoco API list endpoint, in https://developer.yoco.com/openapi/yoco-api-reference.json:
 * `"name":"limit" … "schema":{"type":"integer","minimum":1,"maximum":100,"default":50}`.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
