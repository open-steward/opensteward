/**
 * ShipBob individual TrackingEvent transform.
 *
 * ShipBob represents tracking state as a status on the Shipment object.
 * Each shipment produces a single canonical TrackingEvent at its current status.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ShipBobShipment } from './shipment'

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

export function transformTrackingEvent(raw: ShipBobShipment): TrackingEvent {
  return {
    id: String(raw.id),
    shipmentId: raw.order_id != null ? String(raw.order_id) : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    status: mapTrackingStatus(raw.status),
    description: raw.status ?? undefined,
    occurredAt: toISODate(raw.last_update_at ?? raw.created_date),
    createdAt: toISODate(raw.created_date),
    metadata: raw as Record<string, unknown>,
  }
}
