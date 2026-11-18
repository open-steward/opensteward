import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface SpApiTrackingEvent {
  eventCode: string
  eventTime: string
  description?: string | null
  location?: {
    city?: string | null
    stateOrRegion?: string | null
    countryCode?: string | null
    postalCode?: string | null
  } | null
  [key: string]: unknown
}

export interface SpApiTrackingResponse {
  trackingId: string
  shipmentId?: string
  summary?: { status?: string | null }
  eventHistory?: SpApiTrackingEvent[]
  [key: string]: unknown
}

export function mapSpApiTrackingStatus(
  eventCode: string | null | undefined,
): TrackingEventStatus {
  switch (eventCode) {
    case 'Pickup':
    case 'ReadyForReceive':
      return 'PRE_TRANSIT'
    case 'InTransit':
    case 'ArrivedAtCarrierFacility':
    case 'DepartedCarrierFacility':
      return 'IN_TRANSIT'
    case 'OutForDelivery':
      return 'OUT_FOR_DELIVERY'
    case 'Delivered':
      return 'DELIVERED'
    case 'Exception':
    case 'DeliveryAttempted':
    case 'Undeliverable':
      return 'FAILURE'
    case 'Returned':
      return 'RETURN_TO_SENDER'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: SpApiTrackingResponse): TrackingEvent[] {
  const events = raw.eventHistory ?? []

  if (events.length === 0) {
    return [
      {
        shipmentId: raw.shipmentId ?? undefined,
        trackingNumber: raw.trackingId ?? undefined,
        carrierId: 'amazon-sp-api',
        status: mapSpApiTrackingStatus(raw.summary?.status ?? null),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingId ?? undefined,
    carrierId: 'amazon-sp-api',
    status: mapSpApiTrackingStatus(evt.eventCode),
    description: evt.description ?? undefined,
    location: evt.location
      ? {
          city: evt.location.city ?? undefined,
          state: evt.location.stateOrRegion ?? undefined,
          country: evt.location.countryCode ?? undefined,
          postalCode: evt.location.postalCode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.eventTime),
    metadata: evt as Record<string, unknown>,
  }))
}
