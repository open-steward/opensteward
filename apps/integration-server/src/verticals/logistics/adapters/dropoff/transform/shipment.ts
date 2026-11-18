/**
 * Dropoff is a same-day local courier platform; it does not expose a separate
 * Shipment resource in its CXT API.  A Dropoff "order" is semantically the
 * shipment, so we derive Shipment by re-mapping the Order fields.
 */
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toAddress } from '../../shared/transform'
import type { DropoffOrder } from './tracking'

function mapShipmentStatus(code: string | null | undefined): ShipmentStatus {
  switch ((code ?? '').toLowerCase()) {
    case 'pending':
    case 'queued':
    case 'scheduled':
      return 'PENDING'
    case 'assigned':
    case 'driver_assigned':
      return 'LABEL_CREATED'
    case 'picking_up':
    case 'picked_up':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'arriving':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'complete':
    case 'completed':
      return 'DELIVERED'
    case 'returned':
    case 'return':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
    case 'failed':
    case 'rejected':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: DropoffOrder): Shipment {
  const statusCode = raw.order_status_code ?? raw.order_status
  const originRaw = raw.pickup_address as Record<string, unknown> | undefined
  const destRaw = raw.dropoff_address as Record<string, unknown> | undefined

  return {
    id: raw.order_id,
    status: mapShipmentStatus(statusCode),
    trackingNumber: raw.tracking_number ?? raw.order_id,
    carrierId: 'dropoff',
    originAddress: originRaw ? toAddress(originRaw) : undefined,
    destinationAddress: destRaw ? toAddress(destRaw) : undefined,
    notes: raw.delivery_instructions as string | undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    mode: 'parcel',
    metadata: raw as Record<string, unknown>,
  }
}

export function transformShipmentList(raws: DropoffOrder[]): Shipment[] {
  return raws.map(transformShipment)
}
