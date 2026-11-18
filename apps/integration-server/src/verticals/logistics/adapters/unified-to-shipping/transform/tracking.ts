import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/** Unified.to location address embedded in tracking events. */
export interface UnifiedTrackingEventLocation {
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  regionCode?: string | null
  postalCode?: string | null
  country?: string | null
  countryCode?: string | null
  [key: string]: unknown
}

/** Unified.to ShippingTrackingEvent shape. */
export interface UnifiedShippingTrackingEvent {
  status?: string | null
  description?: string | null
  notes?: string | null
  eventCode?: string | null
  carrierStatusCode?: string | null
  locationAddress?: UnifiedTrackingEventLocation | null
  locationId?: string | null
  locationName?: string | null
  signedBy?: string | null
  createdAt?: string | Date | null
  [key: string]: unknown
}

/** Unified.to ShippingTracking response shape. */
export interface UnifiedShippingTracking {
  id?: string | null
  trackingNumber?: string | null
  shipmentId?: string | null
  carrierId?: string | null
  status?: string | null
  statusDescription?: string | null
  carrierStatusCode?: string | null
  carrierStatusDescription?: string | null
  estimatedDelivery?: string | Date | null
  actualDeliveryAt?: string | Date | null
  events?: UnifiedShippingTrackingEvent[] | null
  raw?: Record<string, unknown> | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'PENDING':            return 'PRE_TRANSIT'
    case 'LABEL_CREATED':      return 'PRE_TRANSIT'
    case 'PROCESSING':         return 'PRE_TRANSIT'
    case 'PICKED_UP':          return 'IN_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'CUSTOMS_CLEARANCE':  return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERY_ATTEMPTED': return 'OUT_FOR_DELIVERY'
    case 'HELD_AT_LOCATION':   return 'AVAILABLE_FOR_PICKUP'
    case 'DELIVERED':          return 'DELIVERED'
    case 'EXCEPTION':          return 'FAILURE'
    case 'EXCEPTION_RESOLVED': return 'FAILURE'
    case 'RETURNED_TO_SENDER': return 'RETURN_TO_SENDER'
    case 'CANCELLED':          return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

function toEventLocation(
  loc: UnifiedTrackingEventLocation | null | undefined,
  locationName?: string | null,
): Address | undefined {
  if (!loc && !locationName) return undefined
  if (!loc) return locationName ? { name: locationName } : undefined
  const hasAny =
    loc.city || loc.region || loc.regionCode || loc.postalCode || loc.country || loc.countryCode
  if (!hasAny && !locationName) return undefined
  return {
    name: locationName ?? undefined,
    street1: loc.address1 ?? undefined,
    street2: loc.address2 ?? undefined,
    city: loc.city ?? undefined,
    state: loc.region ?? loc.regionCode ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.countryCode ?? loc.country ?? undefined,
  }
}

export function transformTracking(raw: UnifiedShippingTracking): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    id: undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrierId ?? undefined,
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? evt.notes ?? undefined,
    location: toEventLocation(evt.locationAddress, evt.locationName),
    occurredAt: toISODate(evt.createdAt),
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }))

  // Emit a summary event if no detail events are available
  if (events.length === 0) {
    events.push({
      id: raw.id ?? undefined,
      shipmentId: raw.shipmentId ?? undefined,
      trackingNumber: raw.trackingNumber ?? undefined,
      carrierId: raw.carrierId ?? undefined,
      status: mapTrackingStatus(raw.status),
      description: raw.statusDescription ?? raw.carrierStatusDescription ?? undefined,
      createdAt: toISODate(raw.createdAt),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
