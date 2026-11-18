/**
 * UPS individual tracking-event transform.
 *
 * Provides a per-event transform for canonical TrackingEvent records derived
 * from a UPS Tracking API activity entry so the router can serve
 * listTrackingEvents.
 *
 * UPS Tracking API v1 returns activities under:
 *   trackResponse.shipment[].package[].activity[]
 *
 * Each activity has:
 *   date (YYYYMMDD), time (HHMMSS),
 *   status.type, status.code, status.description,
 *   location.address { city, stateProvince, countryCode }
 *
 * Docs: https://developer.ups.com/catalog/track
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { UPS_TRACKING_STATUS_MAP } from '../constants'

export interface UPSSingleActivity {
  date?: string | null
  time?: string | null
  location?: {
    address?: {
      city?: string | null
      stateProvince?: string | null
      countryCode?: string | null
    } | null
  } | null
  status?: {
    type?: string | null
    code?: string | null
    description?: string | null
  } | null
}

function mapStatus(statusType: string | null | undefined): TrackingEventStatus {
  if (!statusType) return 'UNKNOWN'
  return (UPS_TRACKING_STATUS_MAP[statusType] as TrackingEventStatus | undefined) ?? 'UNKNOWN'
}

function parseDateTime(date?: string | null, time?: string | null): Date | undefined {
  if (!date) return undefined
  const y = date.substring(0, 4)
  const m = date.substring(4, 6)
  const d = date.substring(6, 8)
  if (!time) return new Date(`${y}-${m}-${d}T00:00:00Z`)
  const hh = time.substring(0, 2)
  const mm = time.substring(2, 4)
  const ss = time.substring(4, 6)
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`)
}

function toLocation(
  loc:
    | { address?: { city?: string | null; stateProvince?: string | null; countryCode?: string | null } | null }
    | null
    | undefined,
): Address | undefined {
  const addr = loc?.address
  if (!addr) return undefined
  const hasAny = addr.city || addr.stateProvince || addr.countryCode
  if (!hasAny) return undefined
  return {
    city: addr.city ?? undefined,
    state: addr.stateProvince ?? undefined,
    country: addr.countryCode ?? undefined,
  }
}

export function transformTrackingEvent(
  raw: UPSSingleActivity,
  trackingNumber?: string,
): TrackingEvent {
  return {
    trackingNumber: trackingNumber ?? undefined,
    carrierId: 'UPS',
    status: mapStatus(raw.status?.type),
    description: raw.status?.description ?? undefined,
    location: toLocation(raw.location),
    occurredAt: parseDateTime(raw.date, raw.time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
