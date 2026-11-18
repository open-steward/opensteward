import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Amazon Shipping raw types ──────────────────────────────────────────────

export interface AmazonTrackingEvent {
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

export interface AmazonTrackingResponse {
  trackingId: string
  shipmentId?: string
  summary?: { status?: string | null }
  eventHistory?: AmazonTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

export function mapAmazonTrackingStatus(eventCode: string | null | undefined): TrackingEventStatus {
  switch (eventCode) {
    case 'Pickup':
    case 'ReadyForReceive':
    case 'PickupDone':
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
    case 'ReturnInitiated':
      return 'RETURN_TO_SENDER'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: AmazonTrackingResponse): TrackingEvent[] {
  const events = raw.eventHistory ?? []

  if (events.length === 0) {
    return [
      {
        shipmentId: raw.shipmentId ?? undefined,
        trackingNumber: raw.trackingId ?? undefined,
        carrierId: 'amazon-shipping',
        status: mapAmazonTrackingStatus(raw.summary?.status ?? null),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingId ?? undefined,
    carrierId: 'amazon-shipping',
    status: mapAmazonTrackingStatus(evt.eventCode),
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
