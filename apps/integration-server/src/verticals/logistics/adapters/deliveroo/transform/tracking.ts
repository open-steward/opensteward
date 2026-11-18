import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw Deliveroo delivery/order payload used for tracking events.
 * Webhooks use the same structure for status callbacks.
 */
export interface DeliverooTrackingRaw {
  id?: string | null
  order_id?: string | null
  status?: string | null
  /** Rider GPS location when available. */
  location?: {
    lat?: number | null
    lon?: number | null
    [key: string]: unknown
  } | null
  /** ISO-8601 timestamp of last status change. */
  updated_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

/**
 * Map Deliveroo delivery/order status to canonical TrackingEventStatus.
 *
 * Lifecycle: pending → placed → accepted → rider_assigned → rider_arrived
 *            → rider_in_transit → rider_nearby → delivered
 * Terminals: canceled, rejected, undeliverable
 */
function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
    case 'placed':
    case 'accepted':
    case 'confirmed':
      return 'PRE_TRANSIT'
    case 'rider_assigned':
    case 'rider_arrived':
    case 'rider_in_transit':
      return 'IN_TRANSIT'
    case 'rider_nearby':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'rejected':
    case 'canceled':
    case 'cancelled':
    case 'undeliverable':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: DeliverooTrackingRaw): TrackingEvent[] {
  const shipmentId = raw.order_id ?? raw.id ?? undefined
  const trackingNumber = raw.id ?? raw.order_id ?? undefined

  // Build location from lat/lon when present
  const loc = raw.location
  const locationAddress =
    loc != null && (loc.lat != null || loc.lon != null)
      ? toAddress({
          city: String(loc.lat ?? '') + (loc.lon != null ? `,${String(loc.lon)}` : ''),
        })
      : undefined

  return [
    {
      shipmentId,
      trackingNumber,
      carrierId: 'deliveroo',
      status: mapStatus(raw.status),
      description: typeof raw.status === 'string' ? raw.status : undefined,
      location: locationAddress,
      occurredAt: toISODate(raw.updated_at ?? raw.created_at),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
