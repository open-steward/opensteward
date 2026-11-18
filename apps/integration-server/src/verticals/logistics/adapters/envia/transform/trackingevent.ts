/**
 * Envia.com → canonical TrackingEvent transform (single-event level).
 *
 * Envia's POST /ship/track response returns a top-level status and an
 * `events[]` / `tracking[]` array. This module exposes a per-event transform
 * (`transformTrackingEvent`) for use when a caller wants to map individual
 * event objects rather than the full response envelope (handled by tracking.ts).
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface EnviaTrackingEventRaw {
  status?: string | null
  description?: string | null
  message?: string | null
  datetime?: string | null
  date?: string | null
  location?: {
    city?: string | null
    state?: string | null
    country?: string | null
    postalCode?: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
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

function toLocation(
  loc: EnviaTrackingEventRaw['location'],
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

/**
 * Transform a single Envia tracking event to canonical TrackingEvent.
 * The `shipmentId`, `trackingNumber`, and `carrierId` come from the parent
 * tracking response.
 */
export function transformTrackingEvent(
  raw: EnviaTrackingEventRaw,
  shipmentId?: string,
  trackingNumber?: string,
  carrierId?: string,
): TrackingEvent {
  return {
    shipmentId,
    trackingNumber,
    carrierId: carrierId ?? undefined,
    status: mapStatus(raw.status),
    description: raw.message ?? raw.description ?? undefined,
    location: toLocation(raw.location),
    occurredAt: toISODate(raw.datetime ?? raw.date),
    metadata: raw as Record<string, unknown>,
  }
}
