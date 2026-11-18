import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// Topship's /track-shipment response shape
export interface TopshipTracking {
  id?: string | null
  trackingId?: string | null
  createdDate?: string | null
  updatedDate?: string | null
  status?: string | null
  message?: string | null
  itemLocation?: string | null
  transshipmentPoint?: string | null
  shipments?: Array<Record<string, unknown>> | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  const s = (status ?? '').toLowerCase().replace(/[\s_-]/g, '')
  if (s === 'delivered')           return 'DELIVERED'
  if (s === 'outfordelivery')      return 'OUT_FOR_DELIVERY'
  if (s.includes('intransit') || s.includes('transit') || s.includes('pickedup') ||
      s.includes('inprogress') || s.includes('assigned') || s.includes('receivedat') ||
      s.includes('arrived'))       return 'IN_TRANSIT'
  if (s.includes('pickup') && (s.includes('await') || s.includes('dropoff')))
                                   return 'PRE_TRANSIT'
  if (s.includes('confirmed') || s.includes('draft') || s.includes('pending') ||
      s.includes('processing'))    return 'PRE_TRANSIT'
  if (s.includes('failed') || s.includes('exception') || s.includes('error'))
                                   return 'FAILURE'
  if (s.includes('return') || s.includes('sender'))
                                   return 'RETURN_TO_SENDER'
  if (s.includes('availableforpickup'))
                                   return 'AVAILABLE_FOR_PICKUP'
  return 'UNKNOWN'
}

export function transformTracking(raw: TopshipTracking): TrackingEvent[] {
  // Topship's track endpoint returns a single snapshot (status + message + itemLocation)
  // rather than a timeline. Emit one canonical event for the current state.
  const event: TrackingEvent = {
    shipmentId: raw.id ?? undefined,
    trackingNumber: raw.trackingId ?? undefined,
    status: mapTrackingStatus(raw.status),
    description: raw.message ?? undefined,
    location: raw.itemLocation
      ? { street1: raw.itemLocation }
      : undefined,
    occurredAt: toISODate(raw.updatedDate ?? raw.createdDate),
    createdAt: toISODate(raw.createdDate),
    metadata: raw as Record<string, unknown>,
  }

  return [event]
}
