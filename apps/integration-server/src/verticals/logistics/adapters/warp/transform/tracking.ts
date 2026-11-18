import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface WarpTrackingEvent {
  eventName?: string
  message?: string
  when?: string
  location?: {
    city?: string
    state?: string
    zipCode?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface WarpEventsResponse {
  shipment_id?: string
  events?: {
    data?: WarpTrackingEvent[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface WarpTrackingResponse {
  shipment_id?: string
  shipment_number?: string
  tracking_number?: string
  mode?: string
  status?: string
  origin_zip?: string
  destination_zip?: string
  pickup_date?: string
  delivery_date?: string
  booked_at?: string
  cancelled_at?: string | null
  pickup_address?: {
    city?: string
    state?: string
    zipCode?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(raw: { city?: string; state?: string; zipCode?: string; [key: string]: unknown } | undefined): Address | undefined {
  if (!raw) return undefined
  const hasAny = raw.city ?? raw.state ?? raw.zipCode
  if (!hasAny) return undefined
  return {
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zipCode ?? undefined,
    country: 'US',
  }
}

export function transformTrackingEvents(
  eventsRes: WarpEventsResponse,
  trackingRes?: WarpTrackingResponse,
): TrackingEvent[] {
  const trackingNumber = eventsRes.shipment_id ?? trackingRes?.tracking_number ?? trackingRes?.shipment_number ?? undefined
  const events = eventsRes.events?.data ?? []

  const mapped: TrackingEvent[] = events.map((evt) => ({
    trackingNumber,
    carrierId: 'warp',
    status: mapTrackingStatus(evt.eventName),
    description: evt.message ?? undefined,
    occurredAt: toISODate(evt.when),
    location: toLocation(evt.location),
    metadata: evt as Record<string, unknown>,
  }))

  if (mapped.length === 0 && trackingRes) {
    mapped.push({
      trackingNumber,
      carrierId: 'warp',
      status: mapTrackingStatus(trackingRes.status),
      description: trackingRes.status ?? undefined,
      occurredAt: toISODate(trackingRes.booked_at),
      location: toLocation(trackingRes.pickup_address),
      metadata: trackingRes as Record<string, unknown>,
    })
  }

  return mapped
}
