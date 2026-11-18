import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ShiptheoryShipment } from './shipment'

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pre_transit':
    case 'pending':
    case 'label created':
      return 'PRE_TRANSIT'
    case 'in transit':
    case 'in_transit':
    case 'dispatched':
      return 'IN_TRANSIT'
    case 'out for delivery':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'available for pickup':
    case 'available_for_pickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'return to sender':
    case 'returned':
      return 'RETURN_TO_SENDER'
    case 'failed':
    case 'exception':
    case 'error':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Shiptheory does not provide a dedicated tracking-events endpoint.
 * We synthesise a single TrackingEvent from the shipment's current status.
 */
export function transformShipmentToTrackingEvents(raw: ShiptheoryShipment): TrackingEvent[] {
  const event: TrackingEvent = {
    shipmentId: raw.channel_reference_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    status: mapTrackingStatus(raw.status),
    description: raw.status ?? undefined,
    occurredAt: toISODate(raw.updated_at ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
  return [event]
}
