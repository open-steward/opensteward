import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

export interface ShypliteTrackingEvent {
  status?: string | null
  description?: string | null
  remark?: string | null
  timestamp?: string | null
  city?: string | null
  state?: string | null
  [key: string]: unknown
}

export interface ShypliteTracking {
  tracking_number?: string | null
  awb?: string | null
  status?: string | null
  scans?: ShypliteTrackingEvent[]
  events?: ShypliteTrackingEvent[]
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase().trim()
  if (s === 'delivered') return 'DELIVERED'
  if (s.includes('out for delivery') || s.includes('out_for_delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('in transit') || s.includes('in_transit') || s.includes('picked up') || s.includes('pickup done')) return 'IN_TRANSIT'
  if (s.includes('booked') || s.includes('pending') || s.includes('manifested') || s.includes('shipment created')) return 'PRE_TRANSIT'
  if (s.includes('rto') || s.includes('return to origin')) return 'RETURN_TO_SENDER'
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('lost') || s.includes('ndr')) return 'FAILURE'
  return 'UNKNOWN'
}

export function transformTracking(raw: ShypliteTracking): TrackingEvent[] {
  const trackingNumber = raw.tracking_number ?? raw.awb ?? undefined
  const events = raw.scans ?? raw.events ?? []

  if (events.length === 0) {
    return [
      {
        trackingNumber,
        carrierId: 'shyplite',
        status: mapStatus(raw.status),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((ev) => ({
    trackingNumber,
    carrierId: 'shyplite',
    status: mapStatus(ev.status ?? raw.status),
    description: ev.description ?? ev.remark ?? undefined,
    occurredAt: ev.timestamp ? new Date(ev.timestamp) : undefined,
    location:
      ev.city || ev.state
        ? { city: ev.city ?? undefined, state: ev.state ?? undefined }
        : undefined,
    metadata: ev as Record<string, unknown>,
  }))
}
