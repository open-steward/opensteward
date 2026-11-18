import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

export interface NarvarTrackingEventRaw {
  tracking_number?: string
  status?: string
  status_description?: string
  event_time?: string
  location?: {
    city?: string
    state?: string
    country?: string
    zip?: string
  }
  [key: string]: unknown
}

function mapStatus(status: string | undefined): TrackingEventStatus {
  switch (status?.toUpperCase()) {
    case 'PRE_TRANSIT':
    case 'LABEL_CREATED':  return 'PRE_TRANSIT'
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY': return 'IN_TRANSIT'
    case 'DELIVERED':      return 'DELIVERED'
    case 'EXCEPTION':
    case 'FAILED':         return 'FAILURE'
    case 'RETURN':         return 'RETURN_TO_SENDER'
    default:               return 'UNKNOWN'
  }
}

export function transformTracking(raw: NarvarTrackingEventRaw): TrackingEvent[] {
  return [
    {
      trackingNumber: raw.tracking_number,
      carrierId: 'narvar',
      status: mapStatus(raw.status),
      description: raw.status_description,
      occurredAt: raw.event_time ? new Date(raw.event_time) : undefined,
      location: raw.location
        ? {
            city: raw.location.city,
            state: raw.location.state,
            country: raw.location.country,
            postalCode: raw.location.zip,
          }
        : undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
