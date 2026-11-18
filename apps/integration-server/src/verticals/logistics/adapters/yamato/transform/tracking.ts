import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Yamato raw types ──────────────────────────────────────────────────────

export interface YamatoTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  office: string | null
  [key: string]: unknown
}

export interface YamatoTrackingResponse {
  tracking_number: string
  status: string | null
  events: YamatoTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────
// Yamato uses English status codes internally mapped from Japanese statuses:
// 受付→ACCEPTED, 輸送中→IN_TRANSIT, 配達中→DELIVERING, 配達完了→DELIVERED,
// 持戻り→HELD, 返送→RETURNED

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'ACCEPTED':   return 'PRE_TRANSIT'
    case 'IN_TRANSIT': return 'IN_TRANSIT'
    case 'DELIVERING': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':  return 'DELIVERED'
    case 'HELD':       return 'FAILURE'
    case 'RETURNED':   return 'RETURN_TO_SENDER'
    default:           return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: YamatoTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'yamato',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'yamato',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
