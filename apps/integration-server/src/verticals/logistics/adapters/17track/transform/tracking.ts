import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface Track17EventAddress {
  country?: string | null
  state?: string | null
  city?: string | null
  street?: string | null
  postal_code?: string | null
  coordinates?: { latitude?: number; longitude?: number } | null
}

export interface Track17Event {
  time_iso?: string | null
  time_utc?: string | null
  time_raw?: { date?: string; time?: string; timezone?: string } | null
  description?: string | null
  description_translation?: { lang?: string; description?: string } | null
  location?: string | null
  stage?: string | null
  sub_status?: string | null
  address?: Track17EventAddress | null
}

export interface Track17Provider {
  provider?: number | null
  provider_name?: string | null
  service_type?: string | null
  events?: Track17Event[] | null
  latest_sync_status?: string | null
  latest_sync_time?: string | null
}

export interface Track17LatestStatus {
  status?: string | null
  sub_status?: string | null
}

export interface Track17ShippingInfo {
  shipper_address?: Track17EventAddress | null
  recipient_address?: Track17EventAddress | null
}

export interface Track17TimeMetrics {
  days_after_order?: number | null
  days_of_transit?: number | null
  days_of_transit_done?: number | null
  days_after_last_update?: number | null
  estimated_delivery_date?: { from?: string | null; to?: string | null } | null
}

export interface Track17TrackInfo {
  shipping_info?: Track17ShippingInfo | null
  latest_status?: Track17LatestStatus | null
  latest_event?: Track17Event | null
  time_metrics?: Track17TimeMetrics | null
  tracking?: { providers?: Track17Provider[] | null } | null
}

export interface Track17TrackItem {
  number: string
  carrier?: number | null
  tag?: string | null
  track_info?: Track17TrackInfo | null
  [key: string]: unknown
}

// ── Status mappers ────────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'InfoReceived':        return 'PRE_TRANSIT'
    case 'InTransit':           return 'IN_TRANSIT'
    case 'OutForDelivery':      return 'OUT_FOR_DELIVERY'
    case 'Delivered':           return 'DELIVERED'
    case 'AvailableForPickup':  return 'AVAILABLE_FOR_PICKUP'
    case 'DeliveryFailure':     return 'FAILURE'
    case 'Exception':           return 'FAILURE'
    case 'Expired':             return 'RETURN_TO_SENDER'
    case 'NotFound':
    default:                    return 'UNKNOWN'
  }
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'InfoReceived':        return 'LABEL_CREATED'
    case 'InTransit':           return 'IN_TRANSIT'
    case 'OutForDelivery':      return 'OUT_FOR_DELIVERY'
    case 'Delivered':           return 'DELIVERED'
    case 'AvailableForPickup':  return 'OUT_FOR_DELIVERY'
    case 'DeliveryFailure':     return 'EXCEPTION'
    case 'Exception':           return 'EXCEPTION'
    case 'Expired':             return 'RETURNED'
    case 'NotFound':
    default:                    return 'UNKNOWN'
  }
}

// ── Address helper ────────────────────────────────────────────────────────────

function toEventAddress(raw: Track17EventAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const hasAny =
    raw.country || raw.state || raw.city || raw.street || raw.postal_code
  if (!hasAny) return undefined
  return {
    street1: raw.street ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    country: raw.country ?? undefined,
    postalCode: raw.postal_code ?? undefined,
  }
}

function locationStringToAddress(location: string | null | undefined): Address | undefined {
  if (!location) return undefined
  // 17TRACK returns location as a plain string, e.g. "Shanghai, China"
  // We surface it as city when no structured address is available.
  const parts = location.split(',').map((p) => p.trim())
  return parts.length > 0
    ? { city: parts[0] ?? undefined, country: parts[parts.length - 1] ?? undefined }
    : undefined
}

// ── Transforms ────────────────────────────────────────────────────────────────

/**
 * Transform a single 17TRACK track item into a list of TrackingEvents — one
 * per provider event. Falls back to a single summary event when no events
 * are available.
 */
export function transformTrackingEvents(item: Track17TrackItem): TrackingEvent[] {
  const trackInfo = item.track_info
  const latestStatus = trackInfo?.latest_status?.status

  const providerEvents: Track17Event[] = (
    trackInfo?.tracking?.providers ?? []
  ).flatMap((p) => p.events ?? [])

  if (providerEvents.length > 0) {
    return providerEvents.map((evt) => {
      const location =
        toEventAddress(evt.address) ??
        locationStringToAddress(evt.location)

      return {
        trackingNumber: item.number,
        carrierId: item.carrier != null ? String(item.carrier) : undefined,
        status: mapTrackingStatus(evt.stage ?? latestStatus),
        description:
          evt.description_translation?.description ??
          evt.description ??
          undefined,
        location,
        occurredAt: toISODate(evt.time_utc ?? evt.time_iso),
        metadata: item as Record<string, unknown>,
      } satisfies TrackingEvent
    })
  }

  // Fallback: emit a single summary event from the latest_event field
  const latestEvt = trackInfo?.latest_event
  const location =
    toEventAddress(latestEvt?.address) ??
    locationStringToAddress(latestEvt?.location)

  return [
    {
      trackingNumber: item.number,
      carrierId: item.carrier != null ? String(item.carrier) : undefined,
      status: mapTrackingStatus(latestStatus),
      description:
        latestEvt?.description_translation?.description ??
        latestEvt?.description ??
        undefined,
      location,
      occurredAt: toISODate(latestEvt?.time_utc ?? latestEvt?.time_iso),
      metadata: item as Record<string, unknown>,
    } satisfies TrackingEvent,
  ]
}

/**
 * Transform a 17TRACK track item into a Shipment.
 */
export function transformShipment(item: Track17TrackItem): Shipment {
  const trackInfo = item.track_info
  const latestStatus = trackInfo?.latest_status?.status

  const shippingInfo = trackInfo?.shipping_info
  const timeMetrics = trackInfo?.time_metrics

  const estimatedDelivery = timeMetrics?.estimated_delivery_date?.from
    ?? timeMetrics?.estimated_delivery_date?.to

  return {
    trackingNumber: item.number,
    status: mapShipmentStatus(latestStatus),
    carrierId: item.carrier != null ? String(item.carrier) : undefined,
    originAddress: toEventAddress(shippingInfo?.shipper_address),
    destinationAddress: toEventAddress(shippingInfo?.recipient_address),
    estimatedDeliveryAt: toISODate(estimatedDelivery),
    metadata: item as Record<string, unknown>,
  }
}
