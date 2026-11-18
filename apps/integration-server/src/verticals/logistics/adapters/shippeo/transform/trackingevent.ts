/**
 * Shippeo individual tracking-event transform.
 *
 * Provides a per-event transform for canonical TrackingEvent records so that
 * the router can serve listTrackingEvents with individual entries derived
 * from Shippeo milestone responses.
 *
 * Shippeo milestone fields:
 *   id, event_code, status, description, occurred_at, estimated_at, location
 *
 * Docs: https://developers.shippeo.com/
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface ShippeoMilestoneLocation {
  city?: string | null
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
  location?: ShippeoMilestoneLocation | null
  [key: string]: unknown
}

function mapStatus(code: string | null | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  const upper = code.toUpperCase().replace(/\s+/g, '_')
  return (TRACKING_STATUS_MAP[upper] as TrackingEventStatus | undefined) ?? 'UNKNOWN'
}

function toLocation(loc: ShippeoMilestoneLocation | null | undefined): Address | undefined {
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

export function transformTrackingEvent(
  raw: ShippeoMilestone,
  trackingNumber?: string,
  shipmentId?: string,
  carrierId?: string,
): TrackingEvent {
  return {
    id: raw.id ?? undefined,
    shipmentId: shipmentId ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: carrierId ?? 'shippeo',
    status: mapStatus(raw.event_code ?? raw.status),
    description: raw.description ?? undefined,
    location: toLocation(raw.location),
    occurredAt: toISODate(raw.occurred_at ?? raw.estimated_at),
    metadata: raw as Record<string, unknown>,
  }
}
