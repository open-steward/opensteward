import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * A single scan / event in a GIGL tracking history entry.
 */
export interface GigTrackingDetail {
  status?: string | null
  description?: string | null
  location?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  eventDate?: string | null
  timestamp?: string | null
  [key: string]: unknown
}

/**
 * Top-level tracking response returned by the GIGL tracking endpoint.
 * Typically obtained via GET /tracking/{waybillNumber}.
 */
export interface GigTracker {
  waybillNumber?: string | null
  shipmentId?: string | null
  currentStatus?: string | null
  carrier?: string | null
  trackingDetails?: GigTrackingDetail[] | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapTrackingStatus(raw: string | null | undefined): TrackingEventStatus {
  if (!raw) return 'UNKNOWN'
  const s = raw.toLowerCase().replace(/[_\s-]/g, '')
  switch (s) {
    case 'pending':
    case 'created':
    case 'pretransit':
      return 'PRE_TRANSIT'
    case 'collected':
    case 'pickedup':
    case 'atservicecenter':
    case 'intransit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'outfordelivery':
    case 'outfordelivery1':
    case 'outfordelivery2':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'availableforpickup':
    case 'readyforpickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'returned':
    case 'returntosender':
    case 'returnedtosender':
      return 'RETURN_TO_SENDER'
    case 'failed':
    case 'faileddelivery':
    case 'exception':
    case 'error':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toLocationAddress(detail: GigTrackingDetail): Address | undefined {
  const city = detail.city ?? (typeof detail.location === 'string' ? detail.location : undefined) ?? undefined
  const state = detail.state ?? undefined
  const country = detail.country ?? undefined
  if (!city && !state && !country) return undefined
  return { city, state, country }
}

export function transformTracker(raw: GigTracker): TrackingEvent[] {
  const details = raw.trackingDetails ?? []

  const events: TrackingEvent[] = details.map((detail) => ({
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.waybillNumber ?? undefined,
    carrierId: raw.carrier ?? 'gig-logistics',
    status: mapTrackingStatus(detail.status ?? raw.currentStatus),
    description: detail.description ?? undefined,
    location: toLocationAddress(detail),
    occurredAt: toISODate(detail.eventDate ?? detail.timestamp),
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }))

  // Emit a synthetic summary event when no detail records are present.
  if (events.length === 0) {
    events.push({
      shipmentId: raw.shipmentId ?? undefined,
      trackingNumber: raw.waybillNumber ?? undefined,
      carrierId: raw.carrier ?? 'gig-logistics',
      status: mapTrackingStatus(raw.currentStatus),
      createdAt: toISODate(raw.createdAt ?? raw.updatedAt),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
