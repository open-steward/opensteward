/**
 * Jumpseller does not expose a dedicated Refund resource via its REST API.
 *
 * Refunds in Jumpseller are recorded as order status changes (status →
 * "Refunded"). There is no `/refunds.json` endpoint in the v1 API.
 *
 * This module exports a minimal stub so the adapter can decline these
 * operations gracefully (the interface marks them optional, so the registry
 * returns 501 automatically when the adapter omits them).
 *
 * Export kept for potential future use once Jumpseller adds a dedicated
 * refund resource.
 */

export {}
