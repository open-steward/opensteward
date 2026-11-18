import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

// ── Shippeo raw types ─────────────────────────────────────────────────────────

export interface ShippeoLocation {
  city?: string
  state?: string | null
  postal_code?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  [key: string]: unknown
}

export interface ShippeoMilestone {
  id?: string | null
  event_code?: string | null
  status?: string | null
  description?: string | null
  occurred_at?: string | null
  estimated_at?: string | null
  location?: ShippeoLocation | null
  [key: string]: unknown
}

export interface ShippeoTrackingResponse {
  shipment_id?: string | null
  tracking_number?: string | null
  carrier_code?: string | null
  status?: string | null
  milestones?: ShippeoMilestone[] | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(code: string | null | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  const upper = code.toUpperCase().replace(/\s+/g, '_')
  return (TRACKING_STATUS_MAP[upper] as TrackingEventStatus | undefined) ?? 'UNKNOWN'
}

function toLocation(loc: ShippeoLocation | null | undefined): Address | undefined {
  if (!loc) return undefined
  const addr: Address = {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postal_code ?? undefined,
    country: loc.country ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTrackingEvents(raw: ShippeoTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.tracking_number ?? raw.shipment_id ?? undefined

  const milestones = raw.milestones ?? []

  if (milestones.length > 0) {
    return milestones.map((m) => ({
      trackingNumber,
      shipmentId: raw.shipment_id ?? undefined,
      carrierId: raw.carrier_code ?? 'shippeo',
      status: mapStatus(m.event_code ?? m.status),
      description: m.description ?? undefined,
      location: toLocation(m.location),
      occurredAt: toISODate(m.occurred_at ?? m.estimated_at),
      metadata: m as Record<string, unknown>,
    }))
  }

  // No milestones — synthesise a single event from the top-level status.
  return [
    {
      trackingNumber,
      shipmentId: raw.shipment_id ?? undefined,
      carrierId: raw.carrier_code ?? 'shippeo',
      status: mapStatus(raw.status),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
