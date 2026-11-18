import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ShipcloudShipment, ShipcloudTrackingEvent } from './shipment'

/**
 * Map a shipcloud tracking event status to the canonical TrackingEventStatus.
 * shipcloud statuses:
 *   label_created, picked_up, transit, out_for_delivery, delivered,
 *   awaits_pickup_by_receiver, canceled, delayed, exception, not_delivered,
 *   destroyed, notification, unknown
 */
function mapTrackingEventStatus(status: string): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'label_created':               return 'PRE_TRANSIT'
    case 'picked_up':                   return 'IN_TRANSIT'
    case 'transit':                     return 'IN_TRANSIT'
    case 'out_for_delivery':            return 'OUT_FOR_DELIVERY'
    case 'delivered':                   return 'DELIVERED'
    case 'awaits_pickup_by_receiver':   return 'AVAILABLE_FOR_PICKUP'
    case 'canceled':                    return 'RETURN_TO_SENDER'
    case 'delayed':                     return 'IN_TRANSIT'
    case 'exception':                   return 'FAILURE'
    case 'not_delivered':               return 'FAILURE'
    case 'destroyed':                   return 'FAILURE'
    case 'return_to_sender':            return 'RETURN_TO_SENDER'
    case 'unknown':
    default:                            return 'UNKNOWN'
  }
}

/**
 * Transform a shipcloud tracking event (embedded in a package) to canonical TrackingEvent.
 */
function transformTrackingEvent(
  raw: ShipcloudTrackingEvent,
  shipmentId: string,
  trackingNumber: string | null | undefined,
  carrierId: string | null | undefined,
  shipmentRaw: Record<string, unknown>,
): TrackingEvent {
  return {
    shipmentId,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: carrierId ?? undefined,
    status: mapTrackingEventStatus(raw.status ?? ''),
    description: raw.details ?? undefined,
    location: raw.location
      ? { city: raw.location }
      : undefined,
    occurredAt: toISODate(raw.timestamp),
    createdAt: toISODate(raw.timestamp),
    metadata: shipmentRaw,
  }
}

/**
 * Extract all tracking events from a shipcloud shipment response.
 * shipcloud embeds tracking_events inside each package.
 * Returns a flat list ordered by occurrence time.
 */
export function transformTrackingEvents(raw: ShipcloudShipment): TrackingEvent[] {
  const shipmentRaw = raw as Record<string, unknown>
  const events: TrackingEvent[] = []

  for (const pkg of raw.packages ?? []) {
    for (const event of pkg.tracking_events ?? []) {
      events.push(
        transformTrackingEvent(
          event,
          raw.id,
          raw.carrier_tracking_no,
          raw.carrier,
          shipmentRaw,
        ),
      )
    }
  }

  // If no tracking events yet, synthesise a LABEL_CREATED stub
  if (events.length === 0 && raw.label_url) {
    events.push({
      shipmentId: raw.id,
      trackingNumber: raw.carrier_tracking_no ?? undefined,
      carrierId: raw.carrier ?? undefined,
      status: 'PRE_TRANSIT',
      description: 'Label created',
      createdAt: toISODate(raw.created_at),
      metadata: shipmentRaw,
    })
  }

  return events
}
