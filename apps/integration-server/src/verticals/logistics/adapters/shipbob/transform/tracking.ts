import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ShipBobShipment } from './shipment'

/**
 * Map ShipBob shipment status to canonical tracking event status.
 */
function mapTrackingStatus(status: string | null): TrackingEventStatus {
  switch (status) {
    case 'LabeledCreated':
    case 'LabelCreated':    return 'PRE_TRANSIT'
    case 'Processing':      return 'IN_TRANSIT'
    case 'Completed':       return 'DELIVERED'
    case 'Exception':       return 'FAILURE'
    case 'OnHold':
    case 'On Hold':         return 'UNKNOWN'
    case 'Cancelled':       return 'FAILURE'
    case 'CleanSweeped':    return 'RETURN_TO_SENDER'
    default:                return 'UNKNOWN'
  }
}

/**
 * Transform a ShipBob shipment into tracking events.
 * ShipBob does not expose granular tracking details per event;
 * each shipment maps to a single TrackingEvent based on its current status.
 */
export function transformTracking(raw: ShipBobShipment): TrackingEvent[] {
  const tn = raw.tracking?.tracking_number ?? raw.tracking_number
  if (!tn && !raw.status) return []

  const event: TrackingEvent = {
    id: String(raw.id),
    shipmentId: raw.order_id != null ? String(raw.order_id) : undefined,
    trackingNumber: tn ?? undefined,
    carrierId: raw.tracking?.carrier ?? raw.carrier ?? undefined,
    status: mapTrackingStatus(raw.status),
    description: raw.status ?? undefined,
    occurredAt: toISODate(raw.last_update_at ?? raw.created_date),
    createdAt: toISODate(raw.created_date),
    metadata: raw as Record<string, unknown>,
  }

  return [event]
}
