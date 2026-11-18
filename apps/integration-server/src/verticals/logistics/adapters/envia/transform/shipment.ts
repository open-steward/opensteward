import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

/**
 * One shipment as the Envia Queries API documents it, both as a row of
 * `GET /guide/{MM}/{YYYY}` and as the `data` object of
 * `GET /guide/{tracking_number}`:
 * https://docs.envia.com/reference/shipments-by-month-year.md
 * https://docs.envia.com/reference/shipment-by-tracking.md
 *
 * The month list documents `tracking_number`, `carrier`, `status` and
 * `created_at`; the single-shipment read adds `origin`, `destination` (typed
 * only as "object", with no documented properties) and `updated_at`.
 */
export interface EnviaShipment {
  tracking_number?: string | null
  carrier?: string | null
  status?: string | null
  origin?: Record<string, unknown> | null
  destination?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * Envia's status names, from the status catalog on the Track Shipments page
 * (https://docs.envia.com/reference/track-shipments.md). The shipment
 * endpoints type `status` only as "Shipment status" / "Current status"
 * strings, so anything outside this catalog stays UNKNOWN.
 */
const STATUS_BY_NAME: Record<string, ShipmentStatus> = {
  created: 'LABEL_CREATED',
  pending: 'PENDING',
  shipped: 'IN_TRANSIT',
  'picked up': 'IN_TRANSIT',
  'out for delivery': 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  canceled: 'CANCELLED',
  returned: 'RETURNED',
  'delivered at origin': 'RETURNED',
  lost: 'EXCEPTION',
  damaged: 'EXCEPTION',
  'address error': 'EXCEPTION',
  undeliverable: 'EXCEPTION',
  rejected: 'EXCEPTION',
  'return problem': 'EXCEPTION',
}

export function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  return STATUS_BY_NAME[status.trim().toLowerCase()] ?? 'UNKNOWN'
}

export function transformShipment(raw: EnviaShipment): Shipment {
  const trackingNumber = raw.tracking_number ?? undefined
  return {
    // The docs name the tracking number as the key GET /guide/{tracking_number} reads by.
    id: trackingNumber,
    status: mapShipmentStatus(raw.status),
    trackingNumber,
    // "The carrier `name` value ... is the exact identifier you must pass to ... the Shipping API"
    carrierId: raw.carrier ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
