import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Venipak tracking event as returned by ws/tracking endpoint.
 * The API returns XML parsed to an object; field names reflect the schema.
 */
export interface VenipakTrackingDetail {
  status?: string | null
  description?: string | null
  event_time?: string | null
  location?: string | null
  city?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface VenipakTrackingResponse {
  tracking_no?: string | null
  pack_no?: string | null
  status?: string | null
  description?: string | null
  event_time?: string | null
  history?: VenipakTrackingDetail | VenipakTrackingDetail[] | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('delivered') || s === '3') return 'DELIVERED'
  if (s.includes('out_for_delivery') || s.includes('out for delivery') || s === '2') return 'OUT_FOR_DELIVERY'
  if (s.includes('in_transit') || s.includes('in transit') || s === '1') return 'IN_TRANSIT'
  if (s.includes('return') || s === '4') return 'RETURN_TO_SENDER'
  if (s.includes('pickup') || s.includes('available')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('pre') || s === '0') return 'PRE_TRANSIT'
  if (s.includes('fail') || s.includes('error') || s === '5') return 'FAILURE'
  return 'UNKNOWN'
}

function toLocation(raw: VenipakTrackingDetail): Address | undefined {
  const city = raw.city ?? raw.location
  if (!city) return undefined
  return {
    city: city ?? undefined,
    country: raw.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: VenipakTrackingResponse): TrackingEvent[] {
  const trackingNumber = String(raw.tracking_no ?? raw.pack_no ?? '')
  const history = raw.history
  const details: VenipakTrackingDetail[] = history
    ? (Array.isArray(history) ? history : [history])
    : []

  const events: TrackingEvent[] = details.map((detail) => ({
    trackingNumber: trackingNumber || undefined,
    carrierId: 'venipak',
    status: mapTrackingStatus(detail.status),
    description: detail.description ?? undefined,
    location: toLocation(detail),
    occurredAt: toISODate(detail.event_time),
    createdAt: toISODate(raw.event_time),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: trackingNumber || undefined,
      carrierId: 'venipak',
      status: mapTrackingStatus(raw.status),
      description: raw.description ?? undefined,
      occurredAt: toISODate(raw.event_time),
      createdAt: toISODate(raw.event_time),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
