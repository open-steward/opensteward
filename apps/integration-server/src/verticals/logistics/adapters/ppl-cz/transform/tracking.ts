import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ── PPL CZ raw tracking types ─────────────────────────────────────────────

export interface PplCzTrackingLocation {
  city?: string | null
  country?: string | null
  zipCode?: string | null
  depot?: string | null
}

export interface PplCzTrackingEvent {
  /** PPL CZ internal state code */
  stateCode?: number | null
  /** Human-readable description of the event */
  stateName?: string | null
  /** Timestamp of the event */
  eventDate?: string | null
  /** Depot or facility where the event occurred */
  depot?: string | null
  location?: PplCzTrackingLocation | null
  [key: string]: unknown
}

export interface PplCzParcelStatus {
  shipmentNumber?: string | null
  referenceId?: string | null
  productType?: string | null
  /** Current state code */
  stateCode?: number | null
  stateName?: string | null
  estimatedDeliveryDate?: string | null
  deliveryDate?: string | null
  events?: PplCzTrackingEvent[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────

/**
 * Map PPL CZ numeric state codes to canonical TrackingEventStatus.
 */
function mapTrackingStatus(stateCode: number | null | undefined): TrackingEventStatus {
  if (stateCode === null || stateCode === undefined) return 'UNKNOWN'
  if (stateCode === 0) return 'PRE_TRANSIT'
  if (stateCode >= 1 && stateCode <= 9) return 'PRE_TRANSIT'
  if (stateCode >= 10 && stateCode <= 19) return 'IN_TRANSIT'
  if (stateCode === 20) return 'DELIVERED'
  if (stateCode === 21) return 'OUT_FOR_DELIVERY'
  if (stateCode === 30) return 'AVAILABLE_FOR_PICKUP'
  if (stateCode >= 50 && stateCode <= 59) return 'RETURN_TO_SENDER'
  if (stateCode >= 90) return 'FAILURE'
  return 'UNKNOWN'
}

// ── Location transform ────────────────────────────────────────────────────

function toLocation(loc: PplCzTrackingLocation | null | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.country || loc.zipCode
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    country: loc.country ?? undefined,
    postalCode: loc.zipCode ?? undefined,
  }
}

// ── Event transforms ──────────────────────────────────────────────────────

export function transformParcelStatus(raw: PplCzParcelStatus): TrackingEvent[] {
  const trackingNumber = raw.shipmentNumber ?? undefined
  const carrierId = 'ppl-cz'

  const events: TrackingEvent[] = (raw.events ?? []).map((ev) => ({
    shipmentId: raw.shipmentNumber ?? undefined,
    trackingNumber,
    carrierId,
    status: mapTrackingStatus(ev.stateCode),
    description: ev.stateName ?? undefined,
    location: toLocation(ev.location),
    occurredAt: toISODate(ev.eventDate),
    createdAt: toISODate(ev.eventDate),
    metadata: ev as Record<string, unknown>,
  }))

  // Fallback: emit a single summary event when no individual events are returned
  if (events.length === 0) {
    events.push({
      shipmentId: raw.shipmentNumber ?? undefined,
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(raw.stateCode),
      description: raw.stateName ?? undefined,
      createdAt: toISODate(raw.deliveryDate ?? raw.estimatedDeliveryDate),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
