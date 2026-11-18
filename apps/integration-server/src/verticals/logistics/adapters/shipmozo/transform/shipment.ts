import type { Shipment, ShipmentStatus } from '../../../schema/shipment'

/**
 * GET /track-order?awb_number= `data` (API documentation PDF, Track-Order
 * API example). `scan_detail` entries have no documented fields, and
 * `expected_delivery_date` / `status_time` are null in the example with no
 * documented format, so neither is read.
 */
export interface ShipMozoTrackData {
  order_id?: string | null
  reference_id?: string | null
  awb_number?: string | null
  courier?: string | null
  expected_delivery_date?: string | null
  current_status?: string | null
  status_time?: string | null
  scan_detail?: unknown[] | null
}

/** Only "Pickup Pending" appears in the docs; anything else is UNKNOWN. */
function mapStatus(status: string | null | undefined): ShipmentStatus {
  if (status === 'Pickup Pending') return 'PENDING'
  return 'UNKNOWN'
}

/**
 * `reference` is `order_id`: Push-Order documents it as "Unique order
 * identifier." and "The order_id must match the one created on your website."
 * (the merchant's order id). `reference_id` has no documented meaning.
 */
export function transformShipment(raw: ShipMozoTrackData): Shipment {
  if (!raw.awb_number) throw new Error('Shipmozo track-order response has no awb_number')
  return {
    id: raw.awb_number,
    trackingNumber: raw.awb_number,
    reference: raw.order_id ?? undefined,
    status: mapStatus(raw.current_status),
    metadata: raw as Record<string, unknown>,
  }
}
