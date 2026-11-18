/**
 * Central Transport tracking-event transforms.
 *
 * Piyovi returns tracking data from POST /v1/shipment/track.
 * The response wraps one or more carrier tracking records; each record contains
 * a status and a history of scan events.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

// ─── Raw Piyovi types ────────────────────────────────────────────────────────

export interface PiyoviTrackingActivity {
  /** ISO-8601 or locale date-time string. */
  activityDateTime?: string
  activityDate?: string
  activityTime?: string
  description?: string
  statusCode?: string
  status?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface PiyoviTrackingRecord {
  trackingNumber?: string
  proNumber?: string
  referenceNumber?: string
  status?: string
  statusDescription?: string
  estimatedDeliveryDate?: string
  deliveredDate?: string
  deliveryDate?: string
  activities?: PiyoviTrackingActivity[]
  events?: PiyoviTrackingActivity[]
  [key: string]: unknown
}

export interface PiyoviTrackingResponse {
  /** Piyovi may return a single record or wrap in a `data` array. */
  data?: PiyoviTrackingRecord | PiyoviTrackingRecord[]
  trackingNumber?: string
  proNumber?: string
  status?: string
  statusDescription?: string
  activities?: PiyoviTrackingActivity[]
  events?: PiyoviTrackingActivity[]
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapStatus(raw: string | undefined): TrackingEventStatus {
  if (!raw) return 'UNKNOWN'
  const normalised = raw.trim()
  const mapped = TRACKING_STATUS_MAP[normalised]
  if (mapped) return mapped as TrackingEventStatus

  const upper = normalised.toUpperCase()
  if (upper.includes('PICKUP') || upper.includes('PICKED')) return 'PRE_TRANSIT'
  if (upper.includes('TRANSIT') || upper.includes('DEPARTED') || upper.includes('ARRIVED'))
    return 'IN_TRANSIT'
  if (upper.includes('OUT FOR') || upper.includes('OUT_FOR')) return 'OUT_FOR_DELIVERY'
  if (upper.includes('DELIVER') || upper.includes('POD')) return 'DELIVERED'
  if (
    upper.includes('EXCEPTION') ||
    upper.includes('DELAY') ||
    upper.includes('HOLD') ||
    upper.includes('CANCEL')
  )
    return 'FAILURE'
  return 'UNKNOWN'
}

function toLocation(raw: PiyoviTrackingActivity): Address | undefined {
  if (!raw.city && !raw.state && !raw.postalCode) return undefined
  return {
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.country ?? 'US',
  }
}

function resolveDateTime(act: PiyoviTrackingActivity): Date | undefined {
  if (act.activityDateTime) return toISODate(act.activityDateTime)
  if (act.activityDate) {
    const combined = act.activityTime
      ? `${act.activityDate}T${act.activityTime}`
      : act.activityDate
    return toISODate(combined)
  }
  return undefined
}

function normaliseRecord(raw: PiyoviTrackingResponse): PiyoviTrackingRecord {
  // Piyovi sometimes returns top-level fields without a nested `data` wrapper.
  if (raw.data) {
    const d = raw.data
    return Array.isArray(d) ? (d[0] ?? {}) : d
  }
  return {
    trackingNumber: raw.trackingNumber ?? raw.proNumber,
    status: raw.status,
    statusDescription: raw.statusDescription,
    activities: raw.activities ?? raw.events,
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTrackingEvents(
  raw: PiyoviTrackingResponse,
  proNumber: string,
): TrackingEvent[] {
  const record = normaliseRecord(raw)
  const trackingNum = record.trackingNumber ?? record.proNumber ?? proNumber
  const activities = record.activities ?? record.events ?? []

  const events: TrackingEvent[] = activities.map((act) => ({
    trackingNumber: trackingNum,
    carrierId: 'central-transport',
    status: mapStatus(act.status ?? act.statusCode),
    description: act.description ?? undefined,
    location: toLocation(act),
    occurredAt: resolveDateTime(act),
    metadata: act as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: trackingNum,
      carrierId: 'central-transport',
      status: mapStatus(record.status),
      description: record.statusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
