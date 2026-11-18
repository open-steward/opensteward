import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import { transformLocation, type TransportifyLocation } from './address'

/**
 * Transportify does not provide a dedicated tracking history endpoint.
 * Status changes are surfaced via the booking object and webhooks.
 * We synthesise a TrackingEvent from the current delivery state.
 */
export interface TransportifyTrackingDelivery {
  id: number | string
  status: string | null
  job_order_number: string | null
  tracking_url: string | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
  canceled_at: string | null
  locations: TransportifyLocation[] | null
  [key: string]: unknown
}

function mapStatusToTracking(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'locating_driver':         return 'PRE_TRANSIT'
    case 'driver_accept_booking':   return 'PRE_TRANSIT'
    case 'delivery_in_progress':    return 'IN_TRANSIT'
    case 'delivery_complete':       return 'DELIVERED'
    case 'canceled':                return 'FAILURE'
    case 'locating_driver_timeout': return 'FAILURE'
    default:                        return 'UNKNOWN'
  }
}

function statusLabel(status: string | null | undefined): string | undefined {
  switch (status) {
    case 'locating_driver':         return 'Locating driver'
    case 'driver_accept_booking':   return 'Driver accepted booking'
    case 'delivery_in_progress':    return 'Delivery in progress'
    case 'delivery_complete':       return 'Delivery complete'
    case 'canceled':                return 'Booking cancelled'
    case 'locating_driver_timeout': return 'Driver location timed out'
    default:                        return undefined
  }
}

export function transformTrackingEvents(raw: TransportifyTrackingDelivery): TrackingEvent[] {
  const locations = raw.locations ?? []
  const currentLocation = locations.find((l) => l != null) ?? null

  // Determine the most relevant timestamp for the current status
  let occurredAt: Date | undefined
  if (raw.status === 'delivery_complete') {
    occurredAt = toISODate(raw.completed_at) ?? toISODate(raw.updated_at)
  } else if (raw.status === 'canceled') {
    occurredAt = toISODate(raw.canceled_at) ?? toISODate(raw.updated_at)
  } else {
    occurredAt = toISODate(raw.updated_at)
  }

  const event: TrackingEvent = {
    shipmentId: String(raw.id),
    trackingNumber: raw.job_order_number ?? String(raw.id),
    carrierId: 'transportify',
    status: mapStatusToTracking(raw.status),
    description: statusLabel(raw.status),
    location: transformLocation(currentLocation),
    occurredAt,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }

  return [event]
}
