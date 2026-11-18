import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate, toAddress } from '../../shared/transform'

export interface VamashipTrackingActivity {
  timestamp: string | null
  status: string | null
  description: string | null
  location: string | null
  status_code: string | null
  [key: string]: unknown
}

export interface VamashipTrackingResponse {
  awb_number: string | null
  courier_name: string | null
  current_status: string | null
  events: VamashipTrackingActivity[] | null
  [key: string]: unknown
}

function mapTrackingStatus(statusCode: string | null, status: string | null): TrackingEventStatus {
  const s = (statusCode ?? status ?? '').toLowerCase()
  if (s.includes('pre_transit') || s.includes('pre-transit') || s.includes('booked') || s.includes('manifested')) {
    return 'PRE_TRANSIT'
  }
  if (s.includes('picked') || s.includes('in_transit') || s.includes('in-transit') || s.includes('transit')) {
    return 'IN_TRANSIT'
  }
  if (s.includes('out_for_delivery') || s.includes('out-for-delivery')) {
    return 'OUT_FOR_DELIVERY'
  }
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('pickup')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('rto') || s.includes('return')) return 'RETURN_TO_SENDER'
  if (s.includes('lost') || s.includes('fail') || s.includes('damage') || s.includes('exception')) {
    return 'FAILURE'
  }
  return 'UNKNOWN'
}

export function transformTracking(
  raw: VamashipTrackingResponse,
  trackingNumber: string,
): TrackingEvent[] {
  const events = raw.events ?? []
  const awb = raw.awb_number ?? trackingNumber
  const carrier = raw.courier_name ?? undefined

  return events.map((event, idx) => ({
    id: `${awb}-${idx}`,
    shipmentId: trackingNumber,
    trackingNumber: awb,
    carrierId: carrier,
    status: mapTrackingStatus(event.status_code, event.status),
    description: event.description ?? event.status ?? undefined,
    location: event.location ? toAddress({ city: event.location }) : undefined,
    occurredAt: toISODate(event.timestamp),
    metadata: event as Record<string, unknown>,
  }))
}
