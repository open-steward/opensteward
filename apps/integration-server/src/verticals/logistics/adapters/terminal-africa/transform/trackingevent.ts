/**
 * Terminal Africa tracking-event transforms — canonical TrackingEvent entity.
 *
 * `transformTrackingEvents` (in ./tracking.ts, re-exported here) reads one
 * `GET /shipments/track/{shipmentId}` response.
 *
 * `transformShipmentEvents` reads the `events` array of a v1 shipment object,
 * for listTrackingEvents. The event object is documented at
 * https://docs.terminal.africa/tship/miscallaneous/shipment-event.md:
 *   created_at  "Time shipment event generated."
 *   description "Description of event e.g. Shipment arranged successfully by User."
 *   location    (a string) "Location for event e.g. Lagos, NG"
 *   status      "Current status after event. e.g. confirmed, in-transit, delivered, etc."
 * Events carry no id. The id here is built from the shipment id, the event's
 * created_at and its status. An event without created_at is skipped: its time
 * is not invented, and without it the id would not be stable. The location
 * string is not an address, so it stays in metadata.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { TerminalAfricaShipment } from './shipment'

export {
  transformTrackingEvents,
  type TerminalAfricaTrackingResponse,
  type TerminalAfricaTrackingEvent,
  type TerminalAfricaTrackingStatus,
} from './tracking'

/** The shipment statuses get-shipments.md documents, as tracking states. */
function mapEventStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'draft':
    case 'pending':
    case 'confirmed':
      return 'PRE_TRANSIT'
    case 'in-transit':
      return 'IN_TRANSIT'
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipmentEvents(shipment: TerminalAfricaShipment): TrackingEvent[] {
  const shipmentId = shipment.shipment_id
  if (!shipmentId) return []
  const trackingNumber = shipment.extras?.tracking_number || undefined
  const carrierId =
    typeof shipment.carrier === 'string' && shipment.carrier ? shipment.carrier : undefined
  const out: TrackingEvent[] = []
  for (const ev of shipment.events ?? []) {
    const occurredAt = toISODate(ev.created_at)
    if (!ev.created_at || !occurredAt) continue
    out.push({
      id: `${shipmentId}:${ev.created_at}:${ev.status ?? ''}`,
      shipmentId,
      trackingNumber,
      carrierId,
      status: mapEventStatus(ev.status),
      description: ev.description || undefined,
      occurredAt,
      metadata: ev as Record<string, unknown>,
    })
  }
  return out
}
