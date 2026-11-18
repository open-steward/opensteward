/**
 * Uber Freight individual tracking-event transform.
 *
 * Provides a per-event transform for canonical TrackingEvent records so that
 * the router can serve listTrackingEvents with individual entries derived
 * from Uber Freight tracking responses.
 *
 * Uber Freight tracking event fields:
 *   timestamp, status, description, location (address/city/state/zipCode/country)
 *
 * Docs: https://developer.uber.com/docs/freight/
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface UberFreightSingleTrackingEvent {
  timestamp?: string | null
  status?: string | null
  description?: string | null
  location?: {
    address?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
    country?: string | null
  } | null
  [key: string]: unknown
}

function mapStatus(code: string | null | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus | undefined) ?? 'UNKNOWN'
}

function toLocation(
  loc:
    | {
        address?: string | null
        city?: string | null
        state?: string | null
        zipCode?: string | null
        country?: string | null
      }
    | null
    | undefined,
): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.zipCode || loc.country
  if (!hasAny) return undefined
  return {
    street1: loc.address ?? undefined,
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.zipCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvent(
  raw: UberFreightSingleTrackingEvent,
  trackingNumber?: string,
  shipmentId?: string,
): TrackingEvent {
  return {
    shipmentId: shipmentId ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: 'uber-freight',
    status: mapStatus(raw.status),
    description: raw.description ?? undefined,
    location: toLocation(raw.location),
    occurredAt: toISODate(raw.timestamp),
    metadata: raw as Record<string, unknown>,
  }
}
