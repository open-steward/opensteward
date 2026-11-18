/**
 * NuORDER Shipment → canonical Fulfillment.
 *
 * Only `tracking_number`, `order_id`/`order_number`, and `shipment_id` are
 * shown verbatim in https://assets.nuorder.com/api-docs/index.html for the
 * Shipment Collection — there is no published request/response JSON example
 * showing carrier, ship date, or line-item fields, so this is a deliberately
 * minimal, write-oriented mapping: only the confirmed fields are sent or
 * read back. There is also no documented GET/list endpoint for shipments —
 * see metadata.ts for why `listFulfillments`/`getFulfillment` are not
 * implemented.
 */
import type { Fulfillment } from '../../../schema/fulfillment'

export interface RawNuorderShipment {
  shipment_id?: string | number
  order_id?: string | number
  order_number?: string
  tracking_number?: string
}

export function transformFulfillment(raw: RawNuorderShipment, fallbackOrderId?: string): Fulfillment {
  const id = raw.shipment_id ?? raw.tracking_number
  const orderId = raw.order_id ?? raw.order_number ?? fallbackOrderId
  if (id == null) {
    throw new Error('NuORDER shipment response has neither shipment_id nor tracking_number — cannot assign a canonical id')
  }
  if (orderId == null) {
    throw new Error('NuORDER shipment response has no order_id/order_number and no fallback orderId was supplied')
  }
  return {
    id: String(id),
    orderId: String(orderId),
    trackingNumber: raw.tracking_number,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical → NuORDER Shipment write body — `tracking_number` is the only confirmed field. */
export function untransformFulfillment(data: Partial<Fulfillment>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.trackingNumber !== undefined) out.tracking_number = data.trackingNumber
  return out
}
