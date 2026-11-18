/**
 * Jumpseller does not expose a dedicated Transaction resource via its REST API.
 *
 * Payment information is embedded in the order object (payment_method_name,
 * financial status inferred from order status). There is no
 * `/transactions.json` endpoint in the Jumpseller v1 API.
 *
 * This module is a placeholder; the adapter omits transaction methods so the
 * registry returns 501 automatically.
 */

export {}
