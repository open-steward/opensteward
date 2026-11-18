import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Raw CDEK status entry as returned in the statuses array.
 */
export interface CdekStatus {
  code?: string | null
  name?: string | null
  date_time?: string | null
  city?: string | null
  [key: string]: unknown
}

/**
 * Raw CDEK tracking response (same shape as order but we focus on statuses).
 */
export interface CdekTrackingResponse {
  uuid?: string | null
  cdek_number?: string | null
  number?: string | null
  statuses?: CdekStatus[] | null
  [key: string]: unknown
}

function mapTrackingStatus(code: string | null | undefined): TrackingEventStatus {
  switch ((code ?? '').toUpperCase()) {
    case 'CREATED':
    case 'ACCEPTED':
      return 'PRE_TRANSIT'
    case 'RECEIVED_AT_SENDER_WAREHOUSE':
    case 'ARRIVED_AT_SENDER_CITY_WAREHOUSE':
    case 'ARRIVED_AT_RECEIVER_CITY_WAREHOUSE':
    case 'IN_TRANSIT':
    case 'IN_CUSTOMS':
    case 'CUSTOMS_CLEARED':
    case 'SENDER_CITY_POSTOMAT':
      return 'IN_TRANSIT'
    case 'READY_FOR_DELIVERY':
    case 'DELIVERY_RESCHEDULED':
    case 'POSTOMAT_POSTED':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
    case 'POSTOMAT_RECEIVED':
      return 'DELIVERED'
    case 'NOT_DELIVERED':
    case 'STORAGE_EXPIRED':
      return 'FAILURE'
    case 'RETURNED_TO_SENDER':
    case 'RETURNED_TO_SENDER_CITY_WAREHOUSE':
      return 'RETURN_TO_SENDER'
    default:
      return 'UNKNOWN'
  }
}

function cityToAddress(city: string | null | undefined): Address | undefined {
  if (!city) return undefined
  return { city }
}

export function transformTrackingEvents(raw: CdekTrackingResponse): TrackingEvent[] {
  const statuses = raw.statuses ?? []
  const trackingNumber = raw.cdek_number ?? undefined
  const shipmentId = raw.uuid ?? undefined

  const events: TrackingEvent[] = statuses.map((s) => ({
    shipmentId,
    trackingNumber,
    carrierId: 'cdek',
    status: mapTrackingStatus(s.code),
    description: s.name ?? undefined,
    location: cityToAddress(s.city),
    occurredAt: toISODate(s.date_time),
    createdAt: toISODate(s.date_time),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      shipmentId,
      trackingNumber,
      carrierId: 'cdek',
      status: 'UNKNOWN',
      createdAt: undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
