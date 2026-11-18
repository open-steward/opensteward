import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import type { SamedayAwbStatusHistory, SamedayExpeditionStatus } from './shipment'

/**
 * Map Sameday status IDs / state strings to canonical TrackingEventStatus.
 *
 * Sameday statusState values observed in production:
 *   "in_transit", "delivered", "out_for_delivery", "returned", "canceled",
 *   "exception", "pre_transit"
 */
function mapTrackingStatus(statusId: number, statusState: string): TrackingEventStatus {
  switch (statusId) {
    case 1:  return 'IN_TRANSIT'
    case 2:  return 'DELIVERED'
    case 3:  return 'OUT_FOR_DELIVERY'
    case 4:  return 'FAILURE'
    case 5:  return 'RETURN_TO_SENDER'
    case 6:  return 'FAILURE'
    case 10: return 'PRE_TRANSIT'
    case 20: return 'IN_TRANSIT'
    case 30: return 'DELIVERED'
  }

  switch (statusState) {
    case 'pre_transit':       return 'PRE_TRANSIT'
    case 'in_transit':        return 'IN_TRANSIT'
    case 'out_for_delivery':  return 'OUT_FOR_DELIVERY'
    case 'delivered':         return 'DELIVERED'
    case 'available_pickup':  return 'AVAILABLE_FOR_PICKUP'
    case 'returned':
    case 'return_to_sender':  return 'RETURN_TO_SENDER'
    case 'failure':
    case 'exception':
    case 'canceled':          return 'FAILURE'
    default:                  return 'UNKNOWN'
  }
}

function toLocation(county: string | null | undefined): Address | undefined {
  if (!county) return undefined
  return { state: county }
}

function mapHistoryEntry(
  entry: SamedayExpeditionStatus,
  trackingNumber: string,
): TrackingEvent {
  return {
    trackingNumber,
    carrierId: 'sameday',
    status: mapTrackingStatus(
      (entry.statusId as number | undefined) ?? 0,
      (entry.statusState as string | undefined) ?? '',
    ),
    description: (entry.statusLabel as string | undefined) ?? undefined,
    location: toLocation(entry.county as string | null | undefined),
    occurredAt: entry.statusDate ? toISODate(entry.statusDate) : undefined,
    metadata: entry as unknown as Record<string, unknown>,
  }
}

/**
 * Transform a GET /api/client/awb/{awb}/status response into an array of
 * canonical TrackingEvents — one per expedition history entry plus a
 * synthetic current-status event if history is empty.
 */
export function transformStatusHistory(
  raw: SamedayAwbStatusHistory,
  awbNumber: string,
): TrackingEvent[] {
  const history = raw.expeditionHistory ?? []

  const events: TrackingEvent[] = history.map((entry) =>
    mapHistoryEntry(entry, awbNumber),
  )

  if (events.length === 0 && raw.expeditionStatus) {
    events.push(mapHistoryEntry(raw.expeditionStatus, awbNumber))
  }

  return events
}
