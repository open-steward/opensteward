import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── SF Express raw types ───────────────────────────────────────────────────

export interface SFRouteInfo {
  opCode: string
  remark: string | null
  acceptTime: string
  acceptAddress: string | null
  [key: string]: unknown
}

export interface SFTrackingResult {
  mailNo: string
  routes: SFRouteInfo[]
  [key: string]: unknown
}

export interface SFTrackingResponse {
  routeResps: SFTrackingResult[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(opCode: string): TrackingEventStatus {
  switch (opCode) {
    case '50':  return 'PRE_TRANSIT'
    case '30':  return 'IN_TRANSIT'
    case '44':  return 'OUT_FOR_DELIVERY'
    case '80':  return 'DELIVERED'
    case '70':  return 'FAILURE'
    case '31':  return 'RETURN_TO_SENDER'
    default:    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: SFTrackingResponse, trackingNumber: string): TrackingEvent[] {
  const events: TrackingEvent[] = []

  for (const result of raw.routeResps ?? []) {
    for (const route of result.routes ?? []) {
      events.push({
        trackingNumber: result.mailNo || trackingNumber,
        carrierId: 'sf-express',
        status: mapTrackingStatus(route.opCode),
        description: route.remark || undefined,
        location: route.acceptAddress
          ? { city: route.acceptAddress }
          : undefined,
        occurredAt: toISODate(route.acceptTime),
        metadata: route as Record<string, unknown>,
      })
    }
  }

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'sf-express',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
