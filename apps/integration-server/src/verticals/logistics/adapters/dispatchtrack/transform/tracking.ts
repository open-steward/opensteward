import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { DispatchTrackServiceOrder } from './shipment'

// ─── DispatchTrack raw event types ────────────────────────────────────────────

/**
 * A single history/shipment event on a DispatchTrack service order.
 * The platform calls these `shipment_events` or `history_events`.
 */
export interface DispatchTrackHistoryEvent {
  id?: string | number | null
  status?: string | null
  description?: string | null
  note?: string | null
  created_at?: string | null
  occurred_at?: string | null
  timestamp?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  address?: string | null
  city?: string | null
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────────

function mapEventStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'new':
    case 'pending':
    case 'label_created':
      return 'PRE_TRANSIT'
    case 'scheduled':
    case 'assigned':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'started':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'finished':
    case 'delivered':
    case 'completed':
      return 'DELIVERED'
    case 'available_for_pickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returned':
    case 'return_to_sender':
      return 'RETURN_TO_SENDER'
    case 'unable_to_finish':
    case 'failed':
    case 'failure':
    case 'exception':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ────────────────────────────────────────────────────────────────

/**
 * Convert a list of DispatchTrack history events into canonical TrackingEvents.
 * Falls back to a single synthetic event derived from the service-order status
 * when no events are present.
 */
export function transformHistoryEvents(
  raw: DispatchTrackServiceOrder,
): TrackingEvent[] {
  const trackingNumber =
    raw.number ?? raw.identifier ?? (raw.id != null ? String(raw.id) : undefined)

  const events = (
    (raw['history_events'] as DispatchTrackHistoryEvent[] | null | undefined) ??
    (raw['shipment_events'] as DispatchTrackHistoryEvent[] | null | undefined) ??
    []
  )

  if (events.length > 0) {
    return events.map((evt) => ({
      shipmentId: raw.id != null ? String(raw.id) : undefined,
      trackingNumber,
      carrierId: 'dispatchtrack',
      status: mapEventStatus(evt.status),
      description: evt.description ?? evt.note ?? undefined,
      location:
        evt.city ?? evt.address
          ? {
              city: evt.city ?? undefined,
              street1: evt.address ?? undefined,
            }
          : undefined,
      occurredAt:
        toISODate(evt.occurred_at) ??
        toISODate(evt.timestamp) ??
        toISODate(evt.created_at) ??
        undefined,
      metadata: evt as Record<string, unknown>,
    }))
  }

  // Synthetic single event from the service-order's current status.
  return [
    {
      shipmentId: raw.id != null ? String(raw.id) : undefined,
      trackingNumber,
      carrierId: 'dispatchtrack',
      status: mapEventStatus(raw.status),
      description: raw.description ?? raw.notes ?? undefined,
      occurredAt:
        toISODate(raw.updated_at) ??
        toISODate(raw.finished_at) ??
        toISODate(raw.started_at) ??
        toISODate(raw.scheduled_at) ??
        toISODate(raw.created_at) ??
        undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
