import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface EnviaTrackingLocation {
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  [key: string]: unknown
}

export interface EnviaTrackingEvent {
  status?: string | null
  description?: string | null
  message?: string | null
  datetime?: string | null
  date?: string | null
  location?: EnviaTrackingLocation | null
  [key: string]: unknown
}

/**
 * Tracking response from POST /ship/track.
 */
export interface EnviaTrackingResponse {
  trackingNumber?: string | null
  carrier?: string | null
  status?: string | null
  shipmentId?: string | null
  events?: EnviaTrackingEvent[] | null
  tracking?: EnviaTrackingEvent[] | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('pre_transit') || s.includes('pre-transit') || s.includes('label') || s.includes('created')) return 'PRE_TRANSIT'
  if (s.includes('in_transit') || s.includes('transit') || s.includes('en_camino')) return 'IN_TRANSIT'
  if (s.includes('out_for_delivery') || s.includes('en_reparto')) return 'OUT_FOR_DELIVERY'
  if (s.includes('delivered') || s.includes('entregado')) return 'DELIVERED'
  if (s.includes('available_for_pickup') || s.includes('pickup')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('return') || s.includes('devuelto')) return 'RETURN_TO_SENDER'
  if (s.includes('fail') || s.includes('exception') || s.includes('error')) return 'FAILURE'
  return 'UNKNOWN'
}

function toTrackingLocation(
  loc: EnviaTrackingLocation | null | undefined,
): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.country || loc.postalCode
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    country: loc.country ?? undefined,
    postalCode: loc.postalCode ?? undefined,
  }
}

export function transformTrackingResponse(raw: EnviaTrackingResponse): TrackingEvent[] {
  const events: EnviaTrackingEvent[] = raw.events ?? raw.tracking ?? []

  const mapped: TrackingEvent[] = events.map((evt) => ({
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrier ?? undefined,
    status: mapTrackingStatus(evt.status ?? raw.status),
    description: evt.message ?? evt.description ?? undefined,
    location: toTrackingLocation(evt.location),
    occurredAt: toISODate(evt.datetime ?? evt.date),
    metadata: raw as Record<string, unknown>,
  }))

  if (mapped.length === 0) {
    mapped.push({
      shipmentId: raw.shipmentId ?? undefined,
      trackingNumber: raw.trackingNumber ?? undefined,
      carrierId: raw.carrier ?? undefined,
      status: mapTrackingStatus(raw.status),
      metadata: raw as Record<string, unknown>,
    })
  }

  return mapped
}
