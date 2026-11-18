/**
 * LogiCommerce order shipment → canonical Fulfillment.
 *
 * Source: GET /orders/{id}/shipments, "Returns the shipments of the order
 * with the indicated identifier."
 * (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=sales&languageId=2).
 * Documented example: `"SHIPMENTS": [{ "ID" : 108, "PID" :"abc", "ROWS": […],
 * "SHIPPING": {…}, "STATUS" : 1, "SUBSTATUSID" : 3, "TRACKINGNUMBER"
 * :"TRK-123", … }]` (the same shipment shape GET /orders/{id} nests under
 * `DELIVERY.SHIPMENTS`).
 *
 * The id is `<orderId>:<shipment ID>`: the order comes from the request path,
 * because no documented shipment field names its order.
 */
import type { Fulfillment } from '../../../schema/fulfillment'
import { requireId } from '../languages'

export interface RawLogicommerceShipment {
  ID?: number
  TRACKINGNUMBER?: string
  [key: string]: unknown
}

export function transformLogicommerceShipment(
  raw: RawLogicommerceShipment,
  orderId: string,
): Fulfillment {
  const shipmentId = requireId('shipment', raw.ID)
  const out: Fulfillment = { id: `${orderId}:${shipmentId}`, orderId, metadata: { ...raw } }
  if (typeof raw.TRACKINGNUMBER === 'string' && raw.TRACKINGNUMBER !== '') {
    out.trackingNumber = raw.TRACKINGNUMBER
  }
  return out
}
