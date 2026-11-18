/**
 * Jumpseller does not expose a dedicated Fulfillment resource via its REST API.
 *
 * Shipment tracking is stored on the order itself via `tracking_number` and
 * `tracking_company` fields, and order status changes (→ "Shipped") represent
 * fulfillment events.
 *
 * There is no `/fulfillments.json` endpoint in the Jumpseller v1 API. This
 * module is kept as a placeholder; the adapter omits fulfillment methods so
 * the registry returns 501 automatically.
 */

export {}
