/**
 * Aramex ME individual tracking-event transform.
 *
 * Re-exports the transform from tracking.ts scoped to a single
 * AramexMeTrackingResult so that the router can serve
 * listTrackingEvents / getTrackingEvents with individual event records.
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface AramexMeTrackingResult {
  WaybillNumber?: string | null
  UpdateCode?: string | null
  UpdateDescription?: string | null
  UpdateDateTime?: string | null
  UpdateLocation?: string | null
  Comments?: string | null
  [key: string]: unknown
}

function mapStatus(updateCode: string | null | undefined): TrackingEventStatus {
  switch (updateCode ?? '') {
    case 'SH001':
    case 'SH002':
      return 'PRE_TRANSIT'
    case 'SH003':
      return 'IN_TRANSIT'
    case 'SH005':
      return 'OUT_FOR_DELIVERY'
    case 'SH006':
      return 'DELIVERED'
    case 'SH014':
      return 'RETURN_TO_SENDER'
    case 'SH062':
      return 'FAILURE'
    case 'SH009':
    default:
      return 'UNKNOWN'
  }
}

export function transformTrackingEvent(
  raw: AramexMeTrackingResult,
  trackingNumber?: string,
): TrackingEvent {
  return {
    trackingNumber: raw.WaybillNumber ?? trackingNumber ?? undefined,
    carrierId: 'aramex-me',
    status: mapStatus(raw.UpdateCode),
    description: raw.UpdateDescription || undefined,
    location: raw.UpdateLocation ? { city: raw.UpdateLocation } : undefined,
    occurredAt: toISODate(raw.UpdateDateTime),
    metadata: raw as Record<string, unknown>,
  }
}
