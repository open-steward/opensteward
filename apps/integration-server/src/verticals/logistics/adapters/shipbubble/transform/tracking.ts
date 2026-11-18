import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ShipbubbleShipment } from './shipment'

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'pending':    return 'PRE_TRANSIT'
    case 'confirmed':  return 'PRE_TRANSIT'
    case 'picked_up':  return 'IN_TRANSIT'
    case 'in_transit': return 'IN_TRANSIT'
    case 'completed':  return 'DELIVERED'
    case 'cancelled':  return 'FAILURE'
    default:           return 'UNKNOWN'
  }
}

export function transformTrackingEvents(raw: ShipbubbleShipment): TrackingEvent[] {
  const events: TrackingEvent[] = []

  // Use the detailed events array when available
  if (raw.events && raw.events.length > 0) {
    for (const ev of raw.events) {
      events.push({
        shipmentId: raw.order_id,
        trackingNumber: raw.courier?.tracking_code ?? undefined,
        carrierId: raw.courier?.name ?? undefined,
        description: ev.message ?? undefined,
        location: ev.location ? { street1: ev.location } : undefined,
        occurredAt: toISODate(ev.captured),
        createdAt: toISODate(raw.date),
        metadata: raw as Record<string, unknown>,
      })
    }
    return events
  }

  // Fall back to package_status milestones
  if (raw.package_status && raw.package_status.length > 0) {
    for (const ps of raw.package_status) {
      events.push({
        shipmentId: raw.order_id,
        trackingNumber: raw.courier?.tracking_code ?? undefined,
        carrierId: raw.courier?.name ?? undefined,
        status: mapTrackingStatus(ps.status),
        description: ps.status ?? undefined,
        occurredAt: toISODate(ps.datetime),
        createdAt: toISODate(raw.date),
        metadata: raw as Record<string, unknown>,
      })
    }
    return events
  }

  // Top-level summary event if no detail exists
  events.push({
    shipmentId: raw.order_id,
    trackingNumber: raw.courier?.tracking_code ?? undefined,
    carrierId: raw.courier?.name ?? undefined,
    status: mapTrackingStatus(raw.status),
    createdAt: toISODate(raw.date),
    metadata: raw as Record<string, unknown>,
  })

  return events
}
