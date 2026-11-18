import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Flowspace tracking event shapes returned from GET /orders/:id/tracking
 * or embedded on order responses.
 */
export interface FlowspaceTrackingLocation {
  city?: string | null
  state?: string | null
  country?: string | null
  zip?: string | null
}

export interface FlowspaceTrackingEvent {
  id?: string
  status?: string
  description?: string | null
  occurred_at?: string | null
  location?: FlowspaceTrackingLocation | null
  carrier?: string | null
  tracking_number?: string | null
}

export interface FlowspaceTrackingResponse {
  order_id?: string
  tracking_number?: string
  carrier?: string | null
  events?: FlowspaceTrackingEvent[]
  current_status?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function mapFlowspaceStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pre_shipment':
    case 'label_created':
      return 'PRE_TRANSIT'
    case 'in_transit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'available_for_pickup':
    case 'pickup_available':
      return 'AVAILABLE_FOR_PICKUP'
    case 'return_to_sender':
    case 'returning':
    case 'returned':
      return 'RETURN_TO_SENDER'
    case 'exception':
    case 'failure':
    case 'error':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toTrackingLocation(loc: FlowspaceTrackingLocation | null | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.country || loc.zip
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    country: loc.country ?? undefined,
    postalCode: loc.zip ?? undefined,
  }
}

/**
 * Transform a Flowspace tracking response into canonical TrackingEvent[].
 * Each event in the events array becomes one TrackingEvent. If there are
 * no event entries a single summary event is synthesised from the root object.
 */
export function transformTrackingResponse(raw: FlowspaceTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((ev) => ({
    shipmentId: raw.order_id ?? undefined,
    trackingNumber: raw.tracking_number ?? ev.tracking_number ?? undefined,
    carrierId: raw.carrier ?? ev.carrier ?? undefined,
    status: mapFlowspaceStatus(ev.status),
    description: ev.description ?? undefined,
    location: toTrackingLocation(ev.location),
    occurredAt: toISODate(ev.occurred_at),
    createdAt: toISODate(raw.created_at),
    metadata: ev as unknown as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      shipmentId: raw.order_id ?? undefined,
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: raw.carrier ?? undefined,
      status: mapFlowspaceStatus(raw.current_status),
      createdAt: toISODate(raw.created_at),
      metadata: raw as unknown as Record<string, unknown>,
    })
  }

  return events
}
