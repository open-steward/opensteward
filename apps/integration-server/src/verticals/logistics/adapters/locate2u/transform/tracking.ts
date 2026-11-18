import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import { transformAddress, type Locate2uContact } from './address'

export interface Locate2uTrackingStop {
  stopId?: number | null
  status?: string | null
  contact?: Locate2uContact | null
  address?: string | null
  location?: { latitude?: number | null; longitude?: number | null } | null
  tripDate?: string | null
  appointmentTime?: string | null
  arrivalDate?: string | null
  notes?: string | null
  [key: string]: unknown
}

export interface Locate2uTracking {
  shipmentId?: number | null
  shipmentRef?: string | null
  status?: string | null
  tripDate?: string | null
  lastModifiedDate?: string | null
  dropStop?: Locate2uTrackingStop | null
  pickupStop?: Locate2uTrackingStop | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'unassigned':
    case 'assigned':
      return 'PRE_TRANSIT'
    case 'accepted':
    case 'inprogress':
    case 'in_progress':
    case 'intransit':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'outfordelivery':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'completed':
    case 'delivered':
      return 'DELIVERED'
    case 'returned':
      return 'RETURN_TO_SENDER'
    case 'failed':
    case 'exception':
    case 'cancelled':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: Locate2uTracking): TrackingEvent[] {
  const shipmentId = raw.shipmentId != null ? String(raw.shipmentId) : undefined
  const trackingNumber = raw.shipmentRef ?? undefined

  // If the drop stop has an arrival date we emit an event for it
  const dropStop = raw.dropStop ?? null
  const events: TrackingEvent[] = []

  if (dropStop) {
    const location = transformAddress(dropStop.address, dropStop.contact)
    events.push({
      shipmentId,
      trackingNumber,
      status: mapTrackingStatus(dropStop.status),
      description: dropStop.notes ?? undefined,
      location,
      occurredAt: toISODate(dropStop.arrivalDate ?? dropStop.appointmentTime ?? dropStop.tripDate),
      createdAt: toISODate(raw.lastModifiedDate ?? raw.tripDate),
      metadata: raw as Record<string, unknown>,
    })
  }

  if (events.length === 0) {
    events.push({
      shipmentId,
      trackingNumber,
      status: mapTrackingStatus(raw.status),
      createdAt: toISODate(raw.lastModifiedDate ?? raw.tripDate),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
