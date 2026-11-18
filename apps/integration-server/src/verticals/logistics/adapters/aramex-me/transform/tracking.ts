import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Aramex ME raw types ────────────────────────────────────────────────────

export interface AramexMeTrackingResult {
  WaybillNumber: string
  UpdateCode: string
  UpdateDescription: string
  UpdateDateTime: string
  UpdateLocation: string | null
  Comments: string | null
  [key: string]: unknown
}

export interface AramexMeTrackingResponse {
  TrackingResults: AramexMeTrackingResult[]
  HasErrors: boolean
  Notifications: unknown[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(updateCode: string): TrackingEventStatus {
  switch (updateCode) {
    case 'SH001':                   return 'PRE_TRANSIT'
    case 'SH002':                   return 'PRE_TRANSIT'
    case 'SH003':                   return 'IN_TRANSIT'
    case 'SH005':                   return 'OUT_FOR_DELIVERY'
    case 'SH006':                   return 'DELIVERED'
    case 'SH009':                   return 'UNKNOWN'
    case 'SH014':                   return 'RETURN_TO_SENDER'
    case 'SH062':                   return 'FAILURE'
    default:                        return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(
  raw: AramexMeTrackingResponse,
  trackingNumber: string,
): TrackingEvent[] {
  const results = raw.TrackingResults ?? []

  const events: TrackingEvent[] = results.map((evt) => ({
    trackingNumber: evt.WaybillNumber ?? trackingNumber,
    carrierId: 'aramex-me',
    status: mapTrackingStatus(evt.UpdateCode),
    description: evt.UpdateDescription || undefined,
    location: evt.UpdateLocation
      ? { city: evt.UpdateLocation }
      : undefined,
    occurredAt: toISODate(evt.UpdateDateTime),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'aramex-me',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
