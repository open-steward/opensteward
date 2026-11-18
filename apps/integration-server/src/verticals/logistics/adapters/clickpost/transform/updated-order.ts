import type { Shipment, ShipmentStatus } from '../../../schema/shipment'

/**
 * One row of `GET /api/v1/updated-order` ("Fetch updated shipment list"),
 * as its OpenAPI definition types it
 * (https://docs.clickpost.ai/reference/fetch-updated-orders-list):
 * `waybill`, `courier_partner`, `created_at`, `updated_at`,
 * `clickpost_status_code`, `timestamp`, `clickpost_status_description`,
 * `reference_number`, `account_code`, `location`, `remark`, `status`,
 * `customer_feedback_present`, `clickpost_city`.
 *
 * `timestamp` is left in metadata: "It is in the same timezone the shipment
 * status was updated", with no offset in the value.
 */
export interface ClickPostUpdatedOrder {
  waybill?: string
  courier_partner?: number
  created_at?: string
  updated_at?: string
  clickpost_status_code?: number
  timestamp?: string
  clickpost_status_description?: string
  reference_number?: string
  account_code?: string
  location?: string
  remark?: string
  status?: string
  customer_feedback_present?: boolean
  clickpost_city?: string
}

/**
 * `clickpost_status_code` values from https://docs.clickpost.ai/docs/tracking-status-codes.
 * Codes not listed here (and 0, `NoStatusExist`) map to UNKNOWN.
 */
const STATUS_BY_CODE: Record<number, ShipmentStatus> = {
  1: 'LABEL_CREATED', // OrderPlaced: Order Has Been Placed / Manifested on Courier Partner
  2: 'LABEL_CREATED', // PickupPending
  3: 'EXCEPTION', // PickupFailed
  4: 'IN_TRANSIT', // PickedUp
  5: 'IN_TRANSIT', // InTransit
  6: 'OUT_FOR_DELIVERY', // OutForDelivery
  7: 'EXCEPTION', // NotServiceable
  8: 'DELIVERED', // Delivered
  9: 'EXCEPTION', // FailedDelivery
  10: 'CANCELLED', // Cancelled
  11: 'RETURNED', // RTO-Requested
  12: 'RETURNED', // RTO-Marked
  13: 'RETURNED', // RTO-OutForDelivery
  14: 'RETURNED', // RTO-Delivered
  15: 'EXCEPTION', // RTO-Failed
  16: 'EXCEPTION', // Lost
  17: 'EXCEPTION', // Damaged
  18: 'EXCEPTION', // ShipmentDelayed: Shipment Is Delayed Or Misroute
  19: 'EXCEPTION', // ContactCustomerCare
  20: 'EXCEPTION', // ShipmentHeld
  21: 'RETURNED', // RTO-InTransit
  25: 'LABEL_CREATED', // OutForPickup
  26: 'RETURNED', // RTO-ContactCustomerCare
  27: 'RETURNED', // RTO-ShipmentDelay
  28: 'LABEL_CREATED', // Awb Registered: AWB registered on Clickpost
  1004: 'IN_TRANSIT', // DestinationHubIn
  1005: 'IN_TRANSIT', // OriginCityIn
  1006: 'IN_TRANSIT', // OriginCityOut
}

export function mapClickPostStatusCode(code: number | undefined): ShipmentStatus {
  return code === undefined ? 'UNKNOWN' : (STATUS_BY_CODE[code] ?? 'UNKNOWN')
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return isNaN(d.getTime()) ? undefined : d
}

/**
 * The shipment's id is its `reference_number`, the value
 * `GET /api/v3/create-order/?reference_number=` reads back (getShipment).
 */
export function transformUpdatedOrder(raw: ClickPostUpdatedOrder): Shipment {
  const createdAt = toDate(raw.created_at)
  const updatedAt = toDate(raw.updated_at)
  return {
    ...(raw.reference_number ? { id: raw.reference_number, reference: raw.reference_number } : {}),
    ...(raw.waybill ? { trackingNumber: raw.waybill } : {}),
    ...(raw.courier_partner !== undefined ? { carrierId: String(raw.courier_partner) } : {}),
    ...(raw.account_code ? { serviceCode: raw.account_code } : {}),
    status: mapClickPostStatusCode(raw.clickpost_status_code),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    metadata: { ...raw },
  }
}
