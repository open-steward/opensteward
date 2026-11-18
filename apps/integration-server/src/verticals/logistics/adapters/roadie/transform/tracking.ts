import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface RoadieShipmentResp {
  id: string | number
  state?: string | null
  tracking_number?: string | null
  events?: Array<{ name?: string | null; occurred_at?: string | null; location?: { city?: string | null; state?: string | null; zip?: string | null } | null }> | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'new':
    case 'scheduled':
    case 'pending':         return 'PRE_TRANSIT'
    case 'accepted':
    case 'en_route_pickup':
    case 'at_pickup':
    case 'picked_up':       return 'IN_TRANSIT'
    case 'en_route_delivery':
    case 'at_delivery':     return 'OUT_FOR_DELIVERY'
    case 'delivered':       return 'DELIVERED'
    case 'returned':        return 'RETURN_TO_SENDER'
    case 'canceled':
    case 'cancelled':       return 'FAILURE'
    default:                return 'UNKNOWN'
  }
}

export function transformTracking(raw: RoadieShipmentResp): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [{
      shipmentId: String(raw.id),
      trackingNumber: raw.tracking_number ?? String(raw.id),
      carrierId: 'roadie',
      status: mapStatus(raw.state),
      metadata: raw as Record<string, unknown>,
    }]
  }
  return events.map(e => ({
    shipmentId: String(raw.id),
    trackingNumber: raw.tracking_number ?? String(raw.id),
    carrierId: 'roadie',
    status: mapStatus(e.name),
    description: e.name ?? undefined,
    location: e.location ? { city: e.location.city ?? undefined, state: e.location.state ?? undefined, postalCode: e.location.zip ?? undefined } : undefined,
    occurredAt: toISODate(e.occurred_at),
    metadata: e as unknown as Record<string, unknown>,
  }))
}
