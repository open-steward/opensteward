import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'

export interface ShipBobShipmentRecipient {
  name: string | null
  full_name: string | null
  email: string | null
  phone_number: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  company_name: string | null
}

export interface ShipBobShipmentMeasurements {
  total_weight_oz: number | null
  length_in: number | null
  width_in: number | null
  depth_in: number | null
}

export interface ShipBobShipmentLocation {
  id: number
  name: string | null
}

export interface ShipBobShipmentProduct {
  id: number
  name: string | null
  sku: string | null
  reference_id: string | null
  [key: string]: unknown
}

export interface ShipBobShipment {
  id: number
  order_id: number | null
  reference_id: string | null
  status: string | null
  created_date: string | null
  last_update_at: string | null
  estimated_fulfillment_date: string | null
  actual_fulfillment_date: string | null
  delivery_date: string | null
  /**
   * Carrier and tracking, which ShipBob returns NESTED — on both the
   * order-level shipment summary and the shipment detail route:
   *
   *     "tracking": { "carrier": "Amazon Shipping",
   *                   "tracking_number": "TBA334553295083",
   *                   "carrier_service": "Amazon Shipping Ground",
   *                   "tracking_url": "https://track.amazon.com/..." }
   *
   * The flat fields below were read instead, and do not exist on either
   * shape — `raw.tracking_number` is `undefined`, so `?? undefined` produced
   * a shipment with no tracking number, no carrier and no service, silently,
   * for every shipment that had all three. The index signature meant
   * TypeScript never objected.
   */
  tracking?: {
    carrier?: string | null
    tracking_number?: string | null
    carrier_service?: string | null
    tracking_url?: string | null
    bol?: string | null
    shipping_date?: string | null
    pro_number?: string | null
    scac?: string | null
  } | null
  /** Retained as a fallback: ShipBob's 1.0 API served these flat. */
  tracking_number: string | null
  tracking_url: string | null
  carrier: string | null
  carrier_service: string | null
  ship_option: string | null
  invoice_amount: number | null
  invoice_currency_code: string | null
  measurements: ShipBobShipmentMeasurements | null
  recipient: ShipBobShipmentRecipient | null
  location: ShipBobShipmentLocation | null
  products: ShipBobShipmentProduct[] | null
  status_details: unknown[] | null
  gift_message: string | null
  require_signature: boolean | null
  insurance_value: number | null
  is_tracking_uploaded: boolean | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'Processing':      return 'IN_TRANSIT'
    case 'Completed':       return 'DELIVERED'
    case 'Cancelled':       return 'CANCELLED'
    case 'Exception':       return 'EXCEPTION'
    case 'OnHold':          return 'PENDING'
    case 'On Hold':         return 'PENDING'
    case 'LabeledCreated':  return 'LABEL_CREATED'
    case 'LabelCreated':    return 'LABEL_CREATED'
    case 'CleanSweeped':    return 'CANCELLED'
    case 'ImportReview':    return 'PENDING'
    case 'None':            return 'PENDING'
    default:                return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShipBobShipment): Shipment {
  const m = raw.measurements

  return {
    id: String(raw.id),
    status: mapShipmentStatus(raw.status),
    // Nested first — that is where 2026-01 puts it. The flat reads remain as
    // a fallback for the older shape rather than as the primary source.
    trackingNumber: raw.tracking?.tracking_number ?? raw.tracking_number ?? undefined,
    carrierId: raw.tracking?.carrier ?? raw.carrier ?? undefined,
    serviceCode:
      raw.tracking?.carrier_service ?? raw.carrier_service ?? raw.ship_option ?? undefined,
    warehouseId: raw.location ? String(raw.location.id) : undefined,
    destinationAddress: toAddress(raw.recipient as Record<string, unknown> | null),
    totalWeight: m ? toWeight(m.total_weight_oz, 'oz') : undefined,
    dimensions: m
      ? toDimensions(m.length_in, m.width_in, m.depth_in, 'in')
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_fulfillment_date),
    actualDeliveryAt: toISODate(raw.delivery_date),
    cost: raw.invoice_amount != null
      ? {
          amount: parseDecimal(raw.invoice_amount) ?? 0,
          currency: raw.invoice_currency_code ?? 'USD',
        }
      : undefined,
    reference: raw.reference_id ?? undefined,
    notes: raw.gift_message ?? undefined,
    createdAt: toISODate(raw.created_date),
    updatedAt: toISODate(raw.last_update_at),
    metadata: raw as Record<string, unknown>,
  }
}
